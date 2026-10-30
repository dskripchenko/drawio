/**
 * draw.io files: pages of mxGraph cells, read into plain data.
 *
 * Accepted: an `.drawio` file (`<mxfile>` with one or more `<diagram>`
 * pages, each compressed or plain), a bare `<mxGraphModel>`, and an SVG
 * exported with the diagram embedded (`.drawio.svg`).
 */
import { DrawioError } from './errors'
import { decompressPage } from './inflate'
import { attr, childElements, parseXml, textContent, type XmlElement, type XmlLimits } from './xml'

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Geometry extends Bounds {
  /** Edge labels and children positioned along an edge: `x` from -1 to 1 along it. */
  relative: boolean
  points: Point[]
  sourcePoint?: Point
  targetPoint?: Point
  offset?: Point
}

export interface Cell {
  id: string
  parent?: string
  /** The label as written: plain text, or HTML when the style has `html=1`. */
  value: string
  /** The style string, parsed: `{ shape: 'ellipse', fillColor: '#fff', … }`. Bare names land in `names`. */
  style: Record<string, string>
  /** Bare names of the style string (`ellipse`, `swimlane`, `text`…), in order. */
  names: string[]
  vertex: boolean
  edge: boolean
  source?: string
  target?: string
  visible: boolean
  collapsed: boolean
  geometry?: Geometry
  /** Attributes of a wrapping `<UserObject>`/`<object>`: `link`, `tooltip`, custom data. */
  data: Record<string, string>
}

export interface Page {
  id?: string
  name?: string
  background?: string
  cells: Map<string, Cell>
  /** Cells in document order: the order they are drawn in. */
  order: Cell[]
  /** The root cell, whose children are the layers. */
  root?: string
}

export interface DrawioFile {
  pages: Page[]
  /** `host`, `agent`, `version` of the writing application, when given. */
  meta: Record<string, string>
}

export interface ParseOptions {
  limits?: XmlLimits
  /** Bytes a compressed page may expand to. Default 50 000 000. */
  maxPageSize?: number
}

/** `a=1;b=2;ellipse;` → `{ a: '1', b: '2' }` and `['ellipse']`. */
export function parseStyle(style: string | undefined): { style: Record<string, string>; names: string[] } {
  const out: Record<string, string> = {}
  const names: string[] = []
  for (const part of (style ?? '').split(';')) {
    const p = part.trim()
    if (!p) continue
    const eq = p.indexOf('=')
    if (eq < 0) names.push(p)
    else out[p.slice(0, eq).trim()] = p.slice(eq + 1).trim()
  }
  return { style: out, names }
}

function num(v: string | undefined, fallback = 0): number {
  const n = v === undefined ? NaN : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function point(e: XmlElement): Point {
  return { x: num(attr(e, 'x')), y: num(attr(e, 'y')) }
}

function geometry(e: XmlElement | undefined): Geometry | undefined {
  if (!e) return undefined
  const g: Geometry = {
    x: num(attr(e, 'x')),
    y: num(attr(e, 'y')),
    width: num(attr(e, 'width')),
    height: num(attr(e, 'height')),
    relative: attr(e, 'relative') === '1',
    points: [],
  }
  for (const c of childElements(e)) {
    const as = attr(c, 'as')
    if (c.local === 'mxPoint') {
      if (as === 'sourcePoint') g.sourcePoint = point(c)
      else if (as === 'targetPoint') g.targetPoint = point(c)
      else if (as === 'offset') g.offset = point(c)
    } else if (c.local === 'Array' && as === 'points') {
      g.points = childElements(c, '', 'mxPoint').map(point)
    }
  }
  return g
}

function readModel(model: XmlElement, page: Omit<Page, 'cells' | 'order'>): Page {
  const root = childElements(model).find((c) => c.local === 'root')
  const cells = new Map<string, Cell>()
  const order: Cell[] = []
  for (const node of root ? childElements(root) : []) {
    let cellNode = node
    let id = attr(node, 'id')
    const data: Record<string, string> = {}
    let value = attr(node, 'value') ?? ''
    if (node.local === 'UserObject' || node.local === 'object') {
      cellNode = childElements(node).find((c) => c.local === 'mxCell') ?? node
      for (const a of node.attributes) if (a.ns === '' && a.local !== 'id') data[a.local] = a.value
      value = data.label ?? ''
      delete data.label
      if (data.placeholders === '1') value = value.replace(/%([\w.-]+)%/g, (whole, key: string) => data[key] ?? whole)
    } else if (node.local !== 'mxCell') {
      continue
    }
    id ??= attr(cellNode, 'id')
    if (!id) continue
    const { style, names } = parseStyle(attr(cellNode, 'style'))
    const cell: Cell = {
      id,
      parent: attr(cellNode, 'parent'),
      value,
      style,
      names,
      vertex: attr(cellNode, 'vertex') === '1',
      edge: attr(cellNode, 'edge') === '1',
      source: attr(cellNode, 'source'),
      target: attr(cellNode, 'target'),
      visible: attr(cellNode, 'visible') !== '0',
      collapsed: attr(cellNode, 'collapsed') === '1',
      geometry: geometry(childElements(cellNode).find((c) => c.local === 'mxGeometry')),
      data,
    }
    cells.set(id, cell)
    order.push(cell)
  }
  const rootCell = order.find((c) => c.parent === undefined)?.id
  return { ...page, cells, order, root: rootCell, background: page.background ?? attr(model, 'background') }
}

/** The diagram embedded in an SVG exported by draw.io, or undefined. */
function fromSvg(text: string, options: ParseOptions): DrawioFile | undefined {
  // Exported SVGs start with a doctype naming the SVG DTD; nothing in it is
  // needed, and an internal subset (`[`) is never accepted.
  const stripped = text.replace(/<!DOCTYPE\s+svg\s+PUBLIC\s+"[^"[\]]*"\s+"[^"[\]]*"\s*>/i, '')
  const svg = parseXml(stripped, options.limits).root
  const content = attr(svg, 'content')
  return content ? parseDrawio(content, options) : undefined
}

/** Reads a draw.io file. */
export function parseDrawio(text: string, options: ParseOptions = {}): DrawioFile {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg|<svg[\s>])/i.test(trimmed)) {
    const file = fromSvg(trimmed, options)
    if (!file) throw new DrawioError('The SVG has no draw.io diagram in it', 0, 0, 'Export from draw.io with "Include a copy of my diagram".')
    return file
  }
  const doc = parseXml(trimmed, options.limits)
  const root = doc.root
  if (root.local === 'mxGraphModel') return { pages: [readModel(root, {})], meta: {} }
  if (root.local !== 'mxfile') {
    throw new DrawioError(`<${root.name}> is not a draw.io file`, root.line, root.column, 'A draw.io file starts with <mxfile> or <mxGraphModel>.')
  }
  const meta: Record<string, string> = {}
  for (const k of ['host', 'agent', 'version', 'type']) {
    const v = attr(root, k)
    if (v) meta[k] = v
  }
  const pages = childElements(root)
    .filter((c) => c.local === 'diagram')
    .map((d) => {
      const head = { id: attr(d, 'id'), name: attr(d, 'name') }
      const model = childElements(d).find((c) => c.local === 'mxGraphModel')
      if (model) return readModel(model, head)
      const packed = textContent(d).trim()
      if (!packed) return { ...head, cells: new Map(), order: [] }
      let xml: string
      try {
        xml = decompressPage(packed, options.maxPageSize)
      } catch (e) {
        throw new DrawioError(`The page "${head.name ?? head.id ?? ''}" cannot be read: ${(e as Error).message}`, d.line, d.column)
      }
      const inner = parseXml(xml, options.limits).root
      if (inner.local !== 'mxGraphModel') throw new DrawioError(`The page "${head.name ?? ''}" holds no diagram`, d.line, d.column)
      return readModel(inner, head)
    })
  if (pages.length === 0) throw new DrawioError('The file has no pages')
  return { pages, meta }
}
