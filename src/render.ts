/**
 * A page of a draw.io file → SVG.
 */
import { el, serialize, txt, type SvgElement } from './core/svg'
import { defaultMeasurer, type FontSpec, type TextMeasurer } from './core/text'
import { along, edgePath, marker, markerInset, route, type Terminal } from './edges'
import { DrawioError } from './errors'
import { htmlLines, lineHeight, lineWidth, plainLines, wrapLines, type Line } from './label'
import { parseDrawio, type Bounds, type Cell, type DrawioFile, type Page, type ParseOptions, type Point } from './model'
import { drawShape, isKnownShape, placeholder, shapeName, type Paint } from './shapes'
import { colorOf, dashOf, flagOf, numberOf, safeColor, stylesheet, v } from './style'

export interface RenderOptions extends ParseOptions {
  /** Which page: its index, id or name. The first by default. */
  page?: number | string
  measureText?: TextMeasurer
  /** Prefix of the ids inside the SVG; unique on the page when a file is shown twice. */
  idPrefix?: string
  title?: string
  padding?: number
  /**
   * Images from `http(s):` addresses are not loaded unless allowed: a
   * viewer's request reveals that the diagram was opened. Images embedded in
   * the file (`data:`) are always shown.
   */
  allowExternalImages?: boolean
}

export interface RenderResult {
  svg: string
  width: number
  height: number
  /** The page drawn. */
  page: { index: number; id?: string; name?: string }
  /** The names of all pages, for a page switcher. */
  pages: string[]
  /** What was drawn as a placeholder or skipped. */
  warnings: string[]
}

const FAMILY = /^[\w\s,'"-]{1,80}$/

function hashId(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `drawio-${(h >>> 0).toString(36)}`
}

function pickPage(file: DrawioFile, which: number | string | undefined): { page: Page; index: number } {
  if (which === undefined) return { page: file.pages[0]!, index: 0 }
  const index = typeof which === 'number' ? which : file.pages.findIndex((p) => p.id === which || p.name === which)
  const page = file.pages[index]
  if (!page) throw new DrawioError(`The file has no page "${which}"`, 0, 0, `It has: ${file.pages.map((p, i) => p.name ?? `#${i}`).join(', ')}.`)
  return { page, index }
}

/** Only addresses that cannot run code: web, mail, relative and in-page links. */
function safeLink(href: string | undefined): string | undefined {
  if (!href) return undefined
  const h = href.trim()
  if (/^(?:https?:|mailto:)/i.test(h)) return h
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return undefined
  return h
}

/** An image address that may be shown: embedded raster or SVG data, or (when allowed) the web. */
function safeImage(src: string | undefined, external: boolean): string | undefined {
  if (!src) return undefined
  const s = src.trim()
  const data = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)(;base64)?,(.*)$/is.exec(s)
  if (data) {
    // draw.io writes `data:image/png,<base64>` without the `;base64` marker.
    const body = data[3]!.replace(/\s/g, '')
    if (!data[2] && /^[A-Za-z0-9+/]+=*$/.test(body) && data[1] !== 'svg+xml') return `data:image/${data[1]};base64,${body}`
    return `data:image/${data[1]}${data[2] ?? ''},${body}`
  }
  if (external && /^https?:\/\//i.test(s)) return s
  return undefined
}

/** Draws one page of a draw.io file. */
export function render(source: string | DrawioFile, options: RenderOptions = {}): RenderResult {
  const file = typeof source === 'string' ? parseDrawio(source, options) : source
  const { page, index } = pickPage(file, options.page)
  const measure = options.measureText ?? defaultMeasurer()
  const warnings: string[] = []
  const rootId = (options.idPrefix ?? hashId(typeof source === 'string' ? source : `${page.id ?? ''}/${index}`)).replace(/[^a-zA-Z0-9_-]/g, '-')
  const cells = page.cells
  const ext = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const grow = (x: number, y: number, w = 0, h = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    ext.minX = Math.min(ext.minX, x)
    ext.minY = Math.min(ext.minY, y)
    ext.maxX = Math.max(ext.maxX, x + w)
    ext.maxY = Math.max(ext.maxY, y + h)
  }

  const isLayer = (c: Cell) => c.parent !== undefined && c.parent === page.root
  // A cell is shown when it and every ancestor are visible and no ancestor container is collapsed.
  const shown = (c: Cell): boolean => {
    for (let p: Cell | undefined = c, first = true; p; p = p.parent ? cells.get(p.parent) : undefined, first = false) {
      if (!p.visible) return false
      if (!first && p.collapsed && p.vertex) return false
    }
    return true
  }
  /** The drawing coordinates of a cell's own coordinate system (its parent chain of vertices). */
  const origin = (c: Cell | undefined): Point => {
    let x = 0
    let y = 0
    for (let p = c; p && !isLayer(p) && p.id !== page.root; p = p.parent ? cells.get(p.parent) : undefined) {
      if (p.vertex && p.geometry && !p.geometry.relative) {
        x += p.geometry.x
        y += p.geometry.y
      }
    }
    return { x, y }
  }
  const boundsOf = (c: Cell): Bounds | undefined => {
    if (!c.geometry || c.geometry.relative) return undefined
    const o = origin(c.parent ? cells.get(c.parent) : undefined)
    return { x: o.x + c.geometry.x, y: o.y + c.geometry.y, width: c.geometry.width, height: c.geometry.height }
  }

  // -------------------------------------------------------------------
  // Labels
  // -------------------------------------------------------------------

  const fontOf = (style: Record<string, string>): { font: FontSpec; family: string; underline: boolean } => {
    const bits = numberOf(style, 'fontStyle', 0, 0, 255)
    const family = style.fontFamily && FAMILY.test(style.fontFamily) ? style.fontFamily : undefined
    return {
      font: { size: numberOf(style, 'fontSize', 12, 1, 200), family: family ?? 'Helvetica, Arial, sans-serif', weight: bits & 1 ? 'bold' : 'normal', style: bits & 2 ? 'italic' : 'normal' },
      family: family ? `${family}, Helvetica, Arial, sans-serif` : '',
      underline: (bits & 4) !== 0,
    }
  }

  const linesOf = (c: Cell): Line[] => (c.style.html === '1' ? htmlLines(c.value) : plainLines(c.value))

  /**
   * A label in `box`, aligned as the style says. `point` mode centres the
   * text on the box's top-left corner (edge labels).
   */
  const label = (c: Cell, box: Bounds, opts: { point?: boolean; background?: string; rotate?: number } = {}): SvgElement | null => {
    if (!c.value || c.style.noLabel === '1') return null
    let lines = linesOf(c)
    if (lines.every((l) => l.every((r) => !r.text.trim()))) return null
    const { font, family, underline } = fontOf(c.style)
    const sp = numberOf(c.style, 'spacing', 2, 0, 200)
    const left = sp + numberOf(c.style, 'spacingLeft', 0, -200, 200)
    const right = sp + numberOf(c.style, 'spacingRight', 0, -200, 200)
    const top = sp + numberOf(c.style, 'spacingTop', 0, -200, 200)
    const bottom = sp + numberOf(c.style, 'spacingBottom', 0, -200, 200)
    const wrap = c.style.whiteSpace === 'wrap' && !opts.point
    if (wrap) lines = wrapLines(lines, Math.max(10, box.width - left - right), font, measure)
    const heights = lines.map((l) => lineHeight(l, font))
    const total = heights.reduce((a, b) => a + b, 0)
    const widest = Math.max(0, ...lines.map((l) => lineWidth(l, font, measure)))
    const align = opts.point ? 'center' : (c.style.align ?? 'center')
    const valign = opts.point ? 'middle' : (c.style.verticalAlign ?? 'middle')
    const x = align === 'left' ? box.x + left : align === 'right' ? box.x + box.width - right : box.x + box.width / 2
    const y0 = valign === 'top' ? box.y + top : valign === 'bottom' ? box.y + box.height - bottom - total : box.y + box.height / 2 - total / 2
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'
    // A shape the file filled keeps the file's text colour (black unless it says
    // otherwise): the theme recolours only what the file left to the defaults.
    const filled = (k: string) => c.style[k] !== undefined && c.style[k] !== 'none' && c.style[k] !== 'default'
    const ownFill = filled('fillColor') || (opts.background !== undefined && filled('labelBackgroundColor'))
    const color = colorOf(c.style, 'fontColor', ownFill ? '#000000' : v('--drawio-text'))
    const left0 = anchor === 'start' ? x : anchor === 'end' ? x - widest : x - widest / 2
    grow(left0, y0, widest, total)
    let cursor = y0
    const tspans = lines.map((line, i) => {
      const lh = heights[i]!
      const baseline = cursor + lh * 0.78
      cursor += lh
      const runs = line.map((r) =>
        r.bold || r.italic || r.underline || r.color || r.size
          ? el(
              'tspan',
              {
                'font-weight': r.bold ? 'bold' : undefined,
                'font-style': r.italic ? 'italic' : undefined,
                'text-decoration': r.underline ? 'underline' : undefined,
                fill: r.color,
                'font-size': r.size,
              },
              [txt(r.text)],
            )
          : txt(r.text),
      )
      return el('tspan', { x, y: baseline }, runs.length > 0 ? runs : [txt('')])
    })
    const text = el(
      'text',
      {
        'text-anchor': anchor,
        'font-size': font.size,
        'font-family': family || undefined,
        'font-weight': font.weight === 'bold' ? 'bold' : undefined,
        'font-style': font.style === 'italic' ? 'italic' : undefined,
        'text-decoration': underline ? 'underline' : undefined,
        fill: color === 'none' ? 'none' : color,
      },
      tspans,
    )
    const bg = opts.background ?? colorOf(c.style, 'labelBackgroundColor', 'none')
    const border = colorOf(c.style, 'labelBorderColor', 'none')
    const kids: SvgElement[] = []
    if (bg !== 'none' || border !== 'none') kids.push(el('rect', { x: left0 - 2, y: y0 - 1, width: widest + 4, height: total + 2, fill: bg, stroke: border === 'none' ? undefined : border }))
    kids.push(text)
    const rotate = opts.rotate
    return el('g', { class: 'drawio-label', transform: rotate ? `rotate(${rotate} ${box.x + box.width / 2} ${box.y + box.height / 2})` : undefined }, kids)
  }

  // -------------------------------------------------------------------
  // Vertices
  // -------------------------------------------------------------------

  const paintOf = (style: Record<string, string>, defs: SvgElement[]): Paint => {
    const strokeWidth = numberOf(style, 'strokeWidth', 1, 0, 100)
    let fill = colorOf(style, 'fillColor', v('--drawio-fill'))
    const gradient = colorOf(style, 'gradientColor', 'none')
    if (fill !== 'none' && gradient !== 'none') {
      const gid = `${rootId}-g${defs.length}`
      const dir = style.gradientDirection ?? 'south'
      const [x1, y1, x2, y2] = dir === 'north' ? [0, 1, 0, 0] : dir === 'east' ? [0, 0, 1, 0] : dir === 'west' ? [1, 0, 0, 0] : [0, 0, 0, 1]
      defs.push(el('linearGradient', { id: gid, x1, y1, x2, y2 }, [el('stop', { offset: 0, 'stop-color': fill }), el('stop', { offset: 1, 'stop-color': gradient })]))
      fill = `url(#${gid})`
    }
    const fo = numberOf(style, 'fillOpacity', 100, 0, 100)
    const so = numberOf(style, 'strokeOpacity', 100, 0, 100)
    return {
      fill,
      stroke: colorOf(style, 'strokeColor', v('--drawio-stroke')),
      strokeWidth,
      dash: dashOf(style, strokeWidth),
      fillOpacity: fo < 100 ? fo / 100 : undefined,
      strokeOpacity: so < 100 ? so / 100 : undefined,
    }
  }

  const defs: SvgElement[] = []
  const body: SvgElement[] = []

  const wrapCell = (c: Cell, kids: (SvgElement | null)[], kind: 'vertex' | 'edge'): SvgElement => {
    const opacity = numberOf(c.style, 'opacity', 100, 0, 100)
    const tooltip = c.data.tooltip
    const group = el(
      'g',
      { class: `drawio-${kind}`, 'data-cell-id': c.id, opacity: opacity < 100 ? opacity / 100 : undefined },
      [tooltip ? el('title', {}, [txt(tooltip)]) : null, ...kids],
    )
    const href = safeLink(c.data.link)
    if (!href) return group
    const external = /^https?:/i.test(href)
    return el('a', { href, target: external ? '_blank' : undefined, rel: external ? 'noopener noreferrer' : undefined }, [group])
  }

  const drawVertex = (c: Cell) => {
    const b = boundsOf(c)
    if (!b) return
    const shape = shapeName(c.style, c.names)
    const kids: (SvgElement | null)[] = []
    const paint = paintOf(c.style, defs)
    const rotation = numberOf(c.style, 'rotation', 0, -360, 360)
    const flip = [flagOf(c.style, 'flipH') ? -1 : 1, flagOf(c.style, 'flipV') ? -1 : 1]
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const shapeTransform = [rotation ? `rotate(${rotation} ${cx} ${cy})` : '', flip[0] !== 1 || flip[1] !== 1 ? `translate(${cx} ${cy}) scale(${flip[0]} ${flip[1]}) translate(${-cx} ${-cy})` : ''].filter(Boolean).join(' ') || undefined
    grow(b.x, b.y, b.width, b.height)

    let labelBox: Bounds = { ...b }
    if (c.style.labelPosition === 'left') labelBox.x -= b.width
    else if (c.style.labelPosition === 'right') labelBox.x += b.width
    if (c.style.verticalLabelPosition === 'top') labelBox.y -= b.height
    else if (c.style.verticalLabelPosition === 'bottom') labelBox.y += b.height
    let labelRotate: number | undefined

    if (shape === 'swimlane' || shape === 'table') {
      const start = numberOf(c.style, 'startSize', shape === 'table' ? 0 : 23, 0, 10000)
      const horizontal = c.style.horizontal !== '0'
      const head: Bounds = horizontal ? { x: b.x, y: b.y, width: b.width, height: Math.min(start, b.height) } : { x: b.x, y: b.y, width: Math.min(start, b.width), height: b.height }
      const bodyFill = colorOf(c.style, 'swimlaneFillColor', 'none')
      const r = c.style.rounded === '1' ? Math.min(numberOf(c.style, 'arcSize', 15, 0, 100) / 100 * Math.min(b.width, b.height), 10) : 0
      kids.push(el('rect', { x: b.x, y: b.y, width: b.width, height: b.height, rx: r || undefined, fill: bodyFill, stroke: paint.stroke, 'stroke-width': paint.strokeWidth, 'stroke-dasharray': paint.dash }))
      kids.push(el('rect', { x: head.x, y: head.y, width: head.width, height: head.height, rx: r || undefined, fill: paint.fill, stroke: paint.stroke, 'stroke-width': paint.strokeWidth, 'stroke-dasharray': paint.dash }))
      labelBox = head
      if (!horizontal) labelRotate = -90
      if (!horizontal) labelBox = { x: head.x + head.width / 2 - head.height / 2, y: head.y + head.height / 2 - head.width / 2, width: head.height, height: head.width }
    } else if (shape === 'image') {
      const src = safeImage(c.style.image, options.allowExternalImages === true)
      if (src) {
        kids.push(el('image', { href: src, x: b.x, y: b.y, width: b.width, height: b.height, preserveAspectRatio: c.style.imageAspect === '0' ? 'none' : 'xMidYMid meet' }))
      } else {
        const ph = placeholder(b, 'image')
        kids.push(...ph.shapes)
        warnings.push(`The image of "${c.id}" is not embedded in the file and is not loaded`)
      }
      if (c.style.verticalLabelPosition === undefined) labelBox = { ...b, y: b.y + b.height }
    } else if (!isKnownShape(shape)) {
      const ph = placeholder(b, shape)
      kids.push(...ph.shapes)
      warnings.push(`"${shape}" is drawn as a placeholder`)
      if (!c.value) {
        kids.push(label({ ...c, value: ph.name, style: { fontColor: v('--drawio-placeholder'), fontSize: '11', whiteSpace: 'wrap' }, names: [] }, b))
        body.push(wrapCell(c, kids, 'vertex'))
        return
      }
    } else {
      const shapes = drawShape(shape, b, paint, c.style)
      kids.push(shapeTransform && shapes.length > 0 ? el('g', { transform: shapeTransform }, shapes) : null, ...(shapeTransform ? [] : shapes))
    }
    const horizontalText = c.style.horizontal === '0' && shape !== 'swimlane' ? -90 : undefined
    kids.push(label(c, labelBox, { rotate: labelRotate ?? horizontalText ?? (rotation || undefined) }))
    body.push(wrapCell(c, kids, 'vertex'))
  }

  // -------------------------------------------------------------------
  // Edges
  // -------------------------------------------------------------------

  const edgePoints = new Map<string, Point[]>()

  const terminal = (id: string | undefined, port: Point | undefined): Terminal | undefined => {
    const t = id ? cells.get(id) : undefined
    if (!t || !t.vertex) return undefined
    const b = boundsOf(t)
    if (!b) return undefined
    return { bounds: b, shape: shapeName(t.style, t.names), port }
  }

  const portOf = (style: Record<string, string>, prefix: 'exit' | 'entry'): Point | undefined => {
    const px = style[`${prefix}X`]
    const py = style[`${prefix}Y`]
    if (px === undefined || py === undefined) return undefined
    const x = Number(px)
    const y = Number(py)
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined
  }

  const drawEdge = (c: Cell) => {
    const g = c.geometry
    const o = origin(c.parent ? cells.get(c.parent) : undefined)
    const shift = (p: Point) => ({ x: p.x + o.x, y: p.y + o.y })
    const source = terminal(c.source, portOf(c.style, 'exit')) ?? (g?.sourcePoint ? shift(g.sourcePoint) : undefined)
    const target = terminal(c.target, portOf(c.style, 'entry')) ?? (g?.targetPoint ? shift(g.targetPoint) : undefined)
    if (!source || !target) {
      warnings.push(`The connector "${c.id}" has no end to draw to`)
      return
    }
    let points = route(source, target, (g?.points ?? []).map(shift), c.style)
    if (points.length < 2) return
    edgePoints.set(c.id, points)
    for (const p of points) grow(p.x, p.y)
    const stroke = colorOf(c.style, 'strokeColor', v('--drawio-stroke'))
    const width = numberOf(c.style, 'strokeWidth', 1, 0, 100)
    const endArrow = c.style.endArrow ?? 'classic'
    const startArrow = c.style.startArrow ?? 'none'
    const endSize = numberOf(c.style, 'endSize', 6, 0, 100)
    const startSize = numberOf(c.style, 'startSize', 6, 0, 100)
    const dir = (a: Point, b: Point) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    }
    const endDir = dir(points[points.length - 2]!, points[points.length - 1]!)
    const startDir = dir(points[1]!, points[0]!)
    const tipEnd = points[points.length - 1]!
    const tipStart = points[0]!
    // The line stops at the back of a solid marker, so it does not poke through.
    const inset = (pts: Point[], d: Point, n: number, atEnd: boolean) => {
      if (n <= 0) return pts
      const copy = pts.map((p) => ({ ...p }))
      const i = atEnd ? copy.length - 1 : 0
      const seg = Math.hypot(copy[i]!.x - copy[atEnd ? i - 1 : 1]!.x, copy[i]!.y - copy[atEnd ? i - 1 : 1]!.y)
      const k = Math.min(n, seg)
      copy[i] = { x: copy[i]!.x - d.x * k, y: copy[i]!.y - d.y * k }
      return copy
    }
    points = inset(points, endDir, endArrow === 'none' ? 0 : markerInset(endArrow, endSize) * 0.9, true)
    points = inset(points, startDir, startArrow === 'none' ? 0 : markerInset(startArrow, startSize) * 0.9, false)
    const kids: (SvgElement | null)[] = [
      el('path', {
        d: edgePath(points, c.style),
        fill: 'none',
        stroke,
        'stroke-width': width,
        'stroke-dasharray': dashOf(c.style, width),
        'stroke-linejoin': 'round',
        'stroke-opacity': numberOf(c.style, 'strokeOpacity', 100, 0, 100) < 100 ? numberOf(c.style, 'strokeOpacity', 100, 0, 100) / 100 : undefined,
      }),
      ...(stroke === 'none' ? [] : marker(endArrow, tipEnd, endDir, endSize, c.style.endFill !== '0', stroke, width)),
      ...(stroke === 'none' ? [] : marker(startArrow, tipStart, startDir, startSize, c.style.startFill !== '0', stroke, width)),
    ]
    if (c.value) {
      const full = edgePoints.get(c.id)!
      const fraction = g ? (g.x + 1) / 2 : 0.5
      const at = along(full, fraction)
      const off = g?.offset ?? { x: 0, y: 0 }
      const perp = g?.y ?? 0
      const p = { x: at.point.x + off.x - at.dir.y * perp, y: at.point.y + off.y + at.dir.x * perp }
      kids.push(label(c, { x: p.x, y: p.y, width: 0, height: 0 }, { point: true, background: colorOf(c.style, 'labelBackgroundColor', v('--drawio-label-background')) }))
    }
    body.push(wrapCell(c, kids, 'edge'))
  }

  /** A vertex positioned along its parent edge (an edge label). */
  const drawEdgeChild = (c: Cell, edge: Cell) => {
    const pts = edgePoints.get(edge.id)
    if (!pts || !c.geometry) return
    const at = along(pts, (c.geometry.x + 1) / 2)
    const off = c.geometry.offset ?? { x: 0, y: 0 }
    const p = { x: at.point.x + off.x, y: at.point.y + off.y - c.geometry.y }
    const bg = colorOf(c.style, 'labelBackgroundColor', c.names.includes('edgeLabel') ? v('--drawio-label-background') : 'none')
    body.push(wrapCell(c, [label(c, { x: p.x, y: p.y, width: 0, height: 0 }, { point: true, background: bg })], 'vertex'))
  }

  // Connectors first among their siblings would hide behind shapes they
  // pass under; draw.io draws in document order, and so does this.
  for (const c of page.order) {
    if (c.id === page.root || isLayer(c) || !shown(c)) continue
    if (c.edge) drawEdge(c)
    else if (c.vertex) {
      const parent = c.parent ? cells.get(c.parent) : undefined
      if (parent?.edge) drawEdgeChild(c, parent)
      else drawVertex(c)
    }
  }

  const padding = options.padding ?? 10
  if (!Number.isFinite(ext.minX)) ext.minX = ext.minY = ext.maxX = ext.maxY = 0
  const x0 = Math.floor(ext.minX - padding)
  const y0 = Math.floor(ext.minY - padding)
  const width = Math.ceil(ext.maxX + padding) - x0
  const height = Math.ceil(ext.maxY + padding) - y0
  const background = page.background && page.background !== 'none' ? safeColor(page.background) : undefined
  const title = options.title ?? page.name ?? 'Diagram'
  const root = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      id: rootId,
      class: 'drawio',
      width,
      height,
      viewBox: `${x0} ${y0} ${width} ${height}`,
      role: 'img',
      'aria-labelledby': `${rootId}-title`,
      style: 'max-width:100%;height:auto',
    },
    [
      el('title', { id: `${rootId}-title` }, [txt(title)]),
      el('style', {}, [txt(stylesheet(rootId))]),
      defs.length > 0 ? el('defs', {}, defs) : null,
      background ? el('rect', { x: x0, y: y0, width, height, fill: background }) : null,
      ...body,
    ],
  )
  return {
    svg: serialize(root),
    width,
    height,
    page: { index, id: page.id, name: page.name },
    pages: file.pages.map((p, i) => p.name ?? `Page ${i + 1}`),
    warnings: [...new Set(warnings)],
  }
}
