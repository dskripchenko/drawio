/**
 * The shapes of draw.io's general, flowchart and basic libraries, as SVG.
 *
 * Every shape is drawn from its bounds and its style. Shapes of the vendor
 * libraries (`mxgraph.aws4.*`, `mxgraph.azure.*`, …) are not drawn: their
 * pictures belong to their owners. They become a labelled placeholder.
 */
import { el, PathBuilder, type SvgElement } from './core/svg'
import type { Bounds } from './model'
import { numberOf } from './style'

export interface Paint {
  fill: string
  stroke: string
  strokeWidth: number
  dash?: string
  fillOpacity?: number
  strokeOpacity?: number
}

type Attrs = Record<string, string | number | undefined>

function attrs(p: Paint, extra: Attrs = {}): Attrs {
  return {
    fill: p.fill,
    stroke: p.stroke,
    'stroke-width': p.stroke === 'none' ? undefined : p.strokeWidth,
    'stroke-dasharray': p.dash,
    'fill-opacity': p.fillOpacity,
    'stroke-opacity': p.strokeOpacity,
    'stroke-linejoin': 'round',
    ...extra,
  }
}

const path = (d: string | PathBuilder, p: Paint, extra: Attrs = {}) => el('path', attrs(p, { d: d.toString(), ...extra }))
const line = (d: string | PathBuilder, p: Paint) => el('path', attrs({ ...p, fill: 'none' }, { d: d.toString() }))

function poly(points: [number, number][], p: Paint): SvgElement {
  const b = new PathBuilder()
  points.forEach(([x, y], i) => (i === 0 ? b.moveTo(x, y) : b.lineTo(x, y)))
  return path(b.close(), p)
}

/** Points of a shape drawn pointing east, turned to `direction`. */
function directed(points: [number, number][], b: Bounds, direction: string | undefined): [number, number][] {
  const { x, y, width: w, height: h } = b
  switch (direction) {
    case 'south':
      return points.map(([u, v]) => [x + (1 - v) * w, y + u * h])
    case 'west':
      return points.map(([u, v]) => [x + (1 - u) * w, y + (1 - v) * h])
    case 'north':
      return points.map(([u, v]) => [x + v * w, y + (1 - u) * h])
    default:
      return points.map(([u, v]) => [x + u * w, y + v * h])
  }
}

function roundedRect(b: Bounds, p: Paint, style: Record<string, string>): SvgElement {
  const rounded = style.rounded === '1'
  let r = 0
  if (rounded) {
    const arc = numberOf(style, 'arcSize', style.absoluteArcSize === '1' ? 20 : 15, 0, 100)
    r = style.absoluteArcSize === '1' ? arc / 2 : (Math.min(b.width, b.height) * arc) / 100
    r = Math.min(r, b.width / 2, b.height / 2)
  }
  return el('rect', attrs(p, { x: b.x, y: b.y, width: Math.max(0, b.width), height: Math.max(0, b.height), rx: r || undefined }))
}

/** Flowchart shapes of the `mxgraph.flowchart` library, drawn with the general ones. */
const FLOWCHART: Record<string, string> = {
  decision: 'rhombus',
  process: 'rectangle',
  terminator: 'terminator',
  document: 'document',
  multi_document: 'document',
  data: 'parallelogram',
  database: 'cylinder',
  start_1: 'ellipse',
  start_2: 'ellipse',
  on_page_reference: 'ellipse',
  off_page_reference: 'offPageConnector',
  predefined_process: 'process',
  manual_input: 'manualInput',
  manual_operation: 'trapezoid',
  delay: 'delay',
  display: 'display',
  preparation: 'hexagon',
  stored_data: 'dataStorage',
  internal_storage: 'internalStorage',
  merge_or_storage: 'triangleDown',
  extract_or_measurement: 'triangleUp',
  or: 'orShape',
  summing_function: 'xorShape',
  card: 'card',
  paper_tape: 'tape',
  loop_limit: 'loopLimit',
  annotation_1: 'annotation',
  annotation_2: 'annotation',
}

/** The shape a cell's style asks for, resolved to one this module draws. */
export function shapeName(style: Record<string, string>, names: string[]): string {
  let shape = style.shape
  if (!shape) shape = names.find((n) => KNOWN.has(n) || n === 'swimlane' || n === 'text' || n === 'group' || n === 'image' || n === 'edgeLabel') ?? 'rectangle'
  if (shape.startsWith('mxgraph.flowchart.')) return FLOWCHART[shape.slice('mxgraph.flowchart.'.length)] ?? 'rectangle'
  if (shape === 'mxgraph.basic.rect' || shape === 'mxgraph.basic.patternFillRect') return 'rectangle'
  if (shape === 'mxgraph.basic.oval') return 'ellipse'
  if (shape === 'orEllipse') return 'orShape'
  if (shape === 'sumEllipse') return 'xorShape'
  // Vendor icons name the picture in a separate key.
  if (shape === 'mxgraph.aws4.resourceIcon' || shape === 'mxgraph.aws4.productIcon') return style.resIcon ?? style.prIcon ?? shape
  return shape
}

const KNOWN = new Set([
  'rectangle', 'label', 'ellipse', 'doubleEllipse', 'rhombus', 'triangle', 'hexagon', 'parallelogram', 'trapezoid', 'cylinder', 'cylinder3', 'document', 'cloud',
  'process', 'note', 'card', 'callout', 'actor', 'umlActor', 'step', 'tape', 'internalStorage', 'manualInput', 'delay', 'display', 'offPageConnector', 'dataStorage',
  'orShape', 'xorShape', 'cross', 'singleArrow', 'doubleArrow', 'partialRectangle', 'line', 'terminator', 'triangleDown', 'triangleUp', 'loopLimit', 'annotation',
  'table', 'tableRow', 'curlyBracket', 'or', 'xor', 'plus', 'link', 'lineEllipse', 'swimlane', 'text', 'image', 'group', 'edgeLabel', 'umlLifeline', 'module', 'component', 'folder', 'datastore', 'cube',
])

/** Whether this module draws the shape (otherwise: a placeholder). */
export function isKnownShape(shape: string): boolean {
  return KNOWN.has(shape)
}

/** SVG for a vertex shape within `b`. Returns null for shapes drawn elsewhere (images, swimlanes) or nothing at all (groups, text). */
export function drawShape(shape: string, b: Bounds, p: Paint, style: Record<string, string>): SvgElement[] {
  const { x, y, width: w, height: h } = b
  const cx = x + w / 2
  const cy = y + h / 2
  const dir = style.direction
  switch (shape) {
    case 'rectangle':
    case 'label':
    case 'tableRow':
    case 'table':
      return [roundedRect(b, p, style)]
    case 'text':
    case 'edgeLabel':
    case 'group':
      // Text has no outline unless its style gives one.
      return style.fillColor || style.strokeColor ? [roundedRect(b, { ...p, fill: style.fillColor ? p.fill : 'none', stroke: style.strokeColor ? p.stroke : 'none' }, style)] : []
    case 'ellipse':
      return [el('ellipse', attrs(p, { cx, cy, rx: w / 2, ry: h / 2 }))]
    case 'doubleEllipse':
    case 'lineEllipse': {
      const inset = Math.min(w, h) * 0.1
      return [el('ellipse', attrs(p, { cx, cy, rx: w / 2, ry: h / 2 })), el('ellipse', attrs({ ...p, fill: 'none' }, { cx, cy, rx: Math.max(0, w / 2 - inset), ry: Math.max(0, h / 2 - inset) }))]
    }
    case 'rhombus':
      return [poly([[cx, y], [x + w, cy], [cx, y + h], [x, cy]], p)]
    case 'triangle':
      return [poly(directed([[0, 0], [1, 0.5], [0, 1]], b, dir), p)]
    case 'triangleDown':
      return [poly([[x, y], [x + w, y], [cx, y + h]], p)]
    case 'triangleUp':
      return [poly([[cx, y], [x + w, y + h], [x, y + h]], p)]
    case 'hexagon': {
      const s = numberOf(style, 'size', 0.25, 0, 0.5)
      return [poly(directed([[s, 0], [1 - s, 0], [1, 0.5], [1 - s, 1], [s, 1], [0, 0.5]], b, dir), p)]
    }
    case 'parallelogram': {
      const s = numberOf(style, 'size', 0.2, 0, 1)
      return [poly(directed([[0, 1], [s, 0], [1, 0], [1 - s, 1]], b, dir), p)]
    }
    case 'trapezoid': {
      const s = numberOf(style, 'size', 0.2, 0, 0.5)
      return [poly(directed([[0, 1], [s, 0], [1 - s, 0], [1, 1]], b, dir), p)]
    }
    case 'manualInput': {
      const s = Math.min(numberOf(style, 'size', 30, 0), h)
      return [poly([[x, y + s], [x + w, y], [x + w, y + h], [x, y + h]], p)]
    }
    case 'cylinder':
    case 'cylinder3':
    case 'datastore': {
      const ry = Math.min(shape === 'cylinder3' ? numberOf(style, 'size', 15, 0) : h * 0.12, h / 3)
      const body = new PathBuilder()
        .moveTo(x, y + ry)
        .arcTo(w / 2, ry, 0, false, true, x + w, y + ry)
        .lineTo(x + w, y + h - ry)
        .arcTo(w / 2, ry, 0, false, true, x, y + h - ry)
        .close()
      const rim = new PathBuilder().moveTo(x, y + ry).arcTo(w / 2, ry, 0, false, false, x + w, y + ry)
      return [path(body, p), line(rim, p)]
    }
    case 'document': {
      const s = numberOf(style, 'size', 0.3, 0, 1) * h * 0.5
      const d = new PathBuilder()
        .moveTo(x, y)
        .lineTo(x + w, y)
        .lineTo(x + w, y + h - s / 2)
        .curveTo(x + w * 0.75, y + h - s * 1.5, x + w * 0.25, y + h + s * 0.5, x, y + h - s / 2)
        .close()
      return [path(d, p)]
    }
    case 'cloud': {
      const d = new PathBuilder()
        .moveTo(x + 0.25 * w, y + 0.25 * h)
        .curveTo(x + 0.05 * w, y + 0.25 * h, x, y + 0.5 * h, x + 0.16 * w, y + 0.55 * h)
        .curveTo(x, y + 0.66 * h, x + 0.18 * w, y + 0.9 * h, x + 0.31 * w, y + 0.8 * h)
        .curveTo(x + 0.4 * w, y + h, x + 0.7 * w, y + h, x + 0.8 * w, y + 0.8 * h)
        .curveTo(x + w, y + 0.8 * h, x + w, y + 0.6 * h, x + 0.875 * w, y + 0.5 * h)
        .curveTo(x + w, y + 0.3 * h, x + 0.8 * w, y + 0.1 * h, x + 0.625 * w, y + 0.2 * h)
        .curveTo(x + 0.5 * w, y + 0.05 * h, x + 0.3 * w, y + 0.05 * h, x + 0.25 * w, y + 0.25 * h)
        .close()
      return [path(d, p)]
    }
    case 'process': {
      const s = numberOf(style, 'size', 0.1, 0, 0.5) * w
      return [roundedRect(b, p, style), line(new PathBuilder().moveTo(x + s, y).lineTo(x + s, y + h).moveTo(x + w - s, y).lineTo(x + w - s, y + h), p)]
    }
    case 'note': {
      const s = Math.min(numberOf(style, 'size', 30, 0), w, h)
      return [poly([[x, y], [x + w - s, y], [x + w, y + s], [x + w, y + h], [x, y + h]], p), line(new PathBuilder().moveTo(x + w - s, y).lineTo(x + w - s, y + s).lineTo(x + w, y + s), p)]
    }
    case 'card': {
      const s = Math.min(numberOf(style, 'size', 15, 0), w, h)
      return [poly([[x + s, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + s]], p)]
    }
    case 'folder': {
      const tw = Math.min(numberOf(style, 'tabWidth', 50, 0), w)
      const th = Math.min(numberOf(style, 'tabHeight', 20, 0), h)
      return [poly([[x, y], [x + tw, y], [x + tw, y + th], [x + w, y + th], [x + w, y + h], [x, y + h]], p)]
    }
    case 'callout': {
      const s = Math.min(numberOf(style, 'size', 30, 0), h)
      const base = numberOf(style, 'base', 20, 0)
      const pos = numberOf(style, 'position', 0.5, 0, 1)
      const px = x + w * pos
      return [poly([[x, y], [x + w, y], [x + w, y + h - s], [px + base / 2, y + h - s], [px, y + h], [px - base / 2, y + h - s], [x, y + h - s]], p)]
    }
    case 'actor': {
      const d = new PathBuilder()
        .moveTo(x, y + h)
        .curveTo(x, y + h * 0.6, x + w * 0.3, y + h * 0.55, x + w * 0.5, y + h * 0.55)
        .curveTo(x + w * 0.7, y + h * 0.55, x + w, y + h * 0.6, x + w, y + h)
        .close()
      return [path(d, p), el('ellipse', attrs(p, { cx, cy: y + h * 0.25, rx: w * 0.22, ry: h * 0.25 }))]
    }
    case 'umlActor': {
      const head = Math.min(w, h / 4) / 2
      const body = new PathBuilder()
        .moveTo(cx, y + head * 2)
        .lineTo(cx, y + h * 0.65)
        .moveTo(x, y + h * 0.35)
        .lineTo(x + w, y + h * 0.35)
        .moveTo(x, y + h)
        .lineTo(cx, y + h * 0.65)
        .lineTo(x + w, y + h)
      return [el('ellipse', attrs(p, { cx, cy: y + head, rx: head, ry: head })), line(body, p)]
    }
    case 'step': {
      const s = numberOf(style, 'size', 0.2, 0, 1) * w
      return [poly(directed([[0, 0], [1 - s / w, 0], [1, 0.5], [1 - s / w, 1], [0, 1], [s / w, 0.5]], b, dir), p)]
    }
    case 'tape': {
      const s = numberOf(style, 'size', 0.4, 0, 1) * h * 0.25
      const d = new PathBuilder()
        .moveTo(x, y + s)
        .quadTo(x + w / 4, y - s, x + w / 2, y + s)
        .quadTo(x + (3 * w) / 4, y + 3 * s, x + w, y + s)
        .lineTo(x + w, y + h - s)
        .quadTo(x + (3 * w) / 4, y + h - 3 * s, x + w / 2, y + h - s)
        .quadTo(x + w / 4, y + h + s, x, y + h - s)
        .close()
      return [path(d, p)]
    }
    case 'internalStorage': {
      const dx = numberOf(style, 'dx', 20, 0)
      const dy = numberOf(style, 'dy', 20, 0)
      return [roundedRect(b, p, style), line(new PathBuilder().moveTo(x + dx, y).lineTo(x + dx, y + h).moveTo(x, y + dy).lineTo(x + w, y + dy), p)]
    }
    case 'delay': {
      const d = new PathBuilder().moveTo(x, y).lineTo(x + w - h / 2, y).arcTo(h / 2, h / 2, 0, false, true, x + w - h / 2, y + h).lineTo(x, y + h).close()
      return [path(d, p)]
    }
    case 'display': {
      const s = w * 0.25
      const d = new PathBuilder()
        .moveTo(x + s, y)
        .lineTo(x + w - h / 2, y)
        .arcTo(h / 2, h / 2, 0, false, true, x + w - h / 2, y + h)
        .lineTo(x + s, y + h)
        .lineTo(x, cy)
        .close()
      return [path(d, p)]
    }
    case 'terminator': {
      const r = Math.min(h / 2, w / 2)
      return [el('rect', attrs(p, { x, y, width: w, height: h, rx: r }))]
    }
    case 'offPageConnector': {
      const s = numberOf(style, 'size', 0.375, 0, 1) * h
      return [poly([[x, y], [x + w, y], [x + w, y + h - s], [cx, y + h], [x, y + h - s]], p)]
    }
    case 'loopLimit': {
      const s = Math.min(numberOf(style, 'size', 20, 0), w / 2, h)
      return [poly([[x + s, y], [x + w - s, y], [x + w, y + s], [x + w, y + h], [x, y + h], [x, y + s]], p)]
    }
    case 'dataStorage': {
      const s = numberOf(style, 'size', 0.1, 0, 1) * w
      const d = new PathBuilder()
        .moveTo(x + s, y)
        .lineTo(x + w, y)
        .quadTo(x + w - s * 2, cy, x + w, y + h)
        .lineTo(x + s, y + h)
        .quadTo(x - s, cy, x + s, y)
        .close()
      return [path(d, p)]
    }
    case 'orShape':
    case 'or':
    case 'xorShape':
    case 'xor': {
      const r = Math.min(w, h) / 2
      const cross = shape.startsWith('or')
        ? new PathBuilder().moveTo(cx - r * 0.707, cy - r * 0.707).lineTo(cx + r * 0.707, cy + r * 0.707).moveTo(cx + r * 0.707, cy - r * 0.707).lineTo(cx - r * 0.707, cy + r * 0.707)
        : new PathBuilder().moveTo(cx - r, cy).lineTo(cx + r, cy).moveTo(cx, cy - r).lineTo(cx, cy + r)
      return [el('ellipse', attrs(p, { cx, cy, rx: w / 2, ry: h / 2 })), line(cross, p)]
    }
    case 'cross':
    case 'plus': {
      const s = numberOf(style, 'size', 0.2, 0, 1)
      const a = (w * (1 - s)) / 2
      const c = (h * (1 - s)) / 2
      return [poly([[x + a, y], [x + w - a, y], [x + w - a, y + c], [x + w, y + c], [x + w, y + h - c], [x + w - a, y + h - c], [x + w - a, y + h], [x + a, y + h], [x + a, y + h - c], [x, y + h - c], [x, y + c], [x + a, y + c]], p)]
    }
    case 'singleArrow': {
      const aw = numberOf(style, 'arrowWidth', 0.3, 0, 1)
      const as = numberOf(style, 'arrowSize', 0.2, 0, 1)
      return [poly(directed([[0, 0.5 - aw / 2], [1 - as, 0.5 - aw / 2], [1 - as, 0], [1, 0.5], [1 - as, 1], [1 - as, 0.5 + aw / 2], [0, 0.5 + aw / 2]], b, dir), p)]
    }
    case 'doubleArrow': {
      const aw = numberOf(style, 'arrowWidth', 0.3, 0, 1)
      const as = numberOf(style, 'arrowSize', 0.2, 0, 0.5)
      return [poly(directed([[0, 0.5], [as, 0], [as, 0.5 - aw / 2], [1 - as, 0.5 - aw / 2], [1 - as, 0], [1, 0.5], [1 - as, 1], [1 - as, 0.5 + aw / 2], [as, 0.5 + aw / 2], [as, 1]], b, dir), p)]
    }
    case 'partialRectangle': {
      const out: SvgElement[] = []
      if (p.fill !== 'none') out.push(el('rect', attrs({ ...p, stroke: 'none' }, { x, y, width: w, height: h })))
      const side = (k: string) => style[k] !== '0'
      const d = new PathBuilder()
      if (side('top')) d.moveTo(x, y).lineTo(x + w, y)
      if (side('right')) d.moveTo(x + w, y).lineTo(x + w, y + h)
      if (side('bottom')) d.moveTo(x, y + h).lineTo(x + w, y + h)
      if (side('left')) d.moveTo(x, y).lineTo(x, y + h)
      if (d.toString()) out.push(line(d, p))
      return out
    }
    case 'line':
      return [line(style.direction === 'south' || style.direction === 'north' ? new PathBuilder().moveTo(cx, y).lineTo(cx, y + h) : new PathBuilder().moveTo(x, cy).lineTo(x + w, cy), p)]
    case 'curlyBracket': {
      const d = new PathBuilder()
        .moveTo(x + w, y)
        .quadTo(x + w / 2, y, x + w / 2, y + h * 0.1)
        .lineTo(x + w / 2, y + h * 0.4)
        .quadTo(x + w / 2, cy, x, cy)
        .quadTo(x + w / 2, cy, x + w / 2, y + h * 0.6)
        .lineTo(x + w / 2, y + h * 0.9)
        .quadTo(x + w / 2, y + h, x + w, y + h)
      return [line(d, p)]
    }
    case 'annotation':
      return [line(new PathBuilder().moveTo(x + Math.min(20, w / 3), y).lineTo(x, y).lineTo(x, y + h).lineTo(x + Math.min(20, w / 3), y + h), p)]
    case 'cube': {
      const s = Math.min(numberOf(style, 'size', 20, 0), w, h)
      return [
        poly([[x, y + s], [x + s, y], [x + w, y], [x + w, y + h - s], [x + w - s, y + h], [x, y + h]], p),
        line(new PathBuilder().moveTo(x, y + s).lineTo(x + w - s, y + s).lineTo(x + w, y).moveTo(x + w - s, y + s).lineTo(x + w - s, y + h), p),
      ]
    }
    case 'component':
    case 'module': {
      const out = [roundedRect({ x: x + 10, y, width: w - 10, height: h }, p, style)]
      out.push(el('rect', attrs(p, { x, y: y + h * 0.25 - 5, width: 20, height: 10 })), el('rect', attrs(p, { x, y: y + h * 0.65 - 5, width: 20, height: 10 })))
      return out
    }
    case 'umlLifeline': {
      const size = Math.min(numberOf(style, 'size', 40, 0), h)
      return [roundedRect({ x, y, width: w, height: size }, p, style), line(new PathBuilder().moveTo(cx, y + size).lineTo(cx, y + h), { ...p, dash: p.dash ?? `${3 * p.strokeWidth} ${3 * p.strokeWidth}` })]
    }
    default:
      return [roundedRect(b, p, style)]
  }
}

/** A labelled stand-in for a shape of a vendor library or anything unknown. */
export function placeholder(b: Bounds, shape: string): { shapes: SvgElement[]; name: string } {
  const last = shape.split('.').pop() ?? shape
  const name = last.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return {
    shapes: [el('rect', { x: b.x, y: b.y, width: Math.max(0, b.width), height: Math.max(0, b.height), rx: 4, fill: 'none', stroke: 'var(--drawio-placeholder, #9ca3af)', 'stroke-dasharray': '4 3', 'stroke-width': 1 })],
    name,
  }
}
