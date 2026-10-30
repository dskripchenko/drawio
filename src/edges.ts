/**
 * Connectors: where they leave and enter shapes, how they bend, and the
 * markers at their ends.
 */
import { el, PathBuilder, type SvgElement } from './core/svg'
import type { Bounds, Point } from './model'
import { numberOf } from './style'

const centre = (b: Bounds): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** Where a line from the centre of `b` towards `to` crosses the outline of its shape. */
export function perimeter(b: Bounds, shape: string, to: Point): Point {
  const c = centre(b)
  const dx = to.x - c.x
  const dy = to.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = b.width / 2
  const hh = b.height / 2
  if (shape === 'ellipse' || shape === 'doubleEllipse' || shape === 'orShape' || shape === 'xorShape') {
    const t = 1 / Math.sqrt((dx * dx) / (hw * hw || 1) + (dy * dy) / (hh * hh || 1))
    return { x: c.x + dx * t, y: c.y + dy * t }
  }
  if (shape === 'rhombus') {
    const t = 1 / (Math.abs(dx) / (hw || 1) + Math.abs(dy) / (hh || 1))
    return { x: c.x + dx * t, y: c.y + dy * t }
  }
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: c.x + dx * t, y: c.y + dy * t }
}

export interface Terminal {
  bounds: Bounds
  shape: string
  /** A fixed port (`exitX`/`exitY`, `entryX`/`entryY`), relative to the bounds. */
  port?: Point
}

function portPoint(t: Terminal): Point | undefined {
  if (!t.port) return undefined
  return { x: t.bounds.x + t.port.x * t.bounds.width, y: t.bounds.y + t.port.y * t.bounds.height }
}

/** The side of the bounds a point on its outline is on. */
function sideOf(b: Bounds, p: Point): 'left' | 'right' | 'top' | 'bottom' {
  const d = [
    ['left', Math.abs(p.x - b.x)],
    ['right', Math.abs(p.x - b.x - b.width)],
    ['top', Math.abs(p.y - b.y)],
    ['bottom', Math.abs(p.y - b.y - b.height)],
  ] as const
  return [...d].sort((a, b2) => a[1] - b2[1])[0]![0]
}

/** Where an orthogonal connector leaves `b` towards `to`. */
function orthogonalExit(t: Terminal, to: Point): Point {
  const port = portPoint(t)
  if (port) return port
  const b = t.bounds
  const c = centre(b)
  // Straight across when the next point lies within the shape's span.
  if (to.x >= b.x && to.x <= b.x + b.width && (to.y < b.y || to.y > b.y + b.height)) return { x: to.x, y: to.y < b.y ? b.y : b.y + b.height }
  if (to.y >= b.y && to.y <= b.y + b.height && (to.x < b.x || to.x > b.x + b.width)) return { x: to.x < b.x ? b.x : b.x + b.width, y: to.y }
  const dx = to.x - c.x
  const dy = to.y - c.y
  if (Math.abs(dx) * b.height >= Math.abs(dy) * b.width) return { x: dx > 0 ? b.x + b.width : b.x, y: c.y }
  return { x: c.x, y: dy > 0 ? b.y + b.height : b.y }
}

/** Adds corners so every segment is horizontal or vertical; `startHorizontal` says which way the first leaves. */
function orthogonalise(points: Point[], startHorizontal: boolean): Point[] {
  const out: Point[] = [points[0]!]
  let horizontal = startHorizontal
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1]!
    const b = points[i]!
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) out.push(horizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y })
    out.push(b)
    // Each waypoint turns the line: the next segment is perpendicular to this one.
    const prev = out[out.length - 2]!
    horizontal = Math.abs(prev.y - b.y) > 0.01
  }
  return dedupe(out)
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    out.push(p)
  }
  return out
}

/**
 * The points a connector passes through: from its source (a shape, or a
 * loose point) through its waypoints to its target.
 */
export function route(
  source: Terminal | Point,
  target: Terminal | Point,
  waypoints: Point[],
  style: Record<string, string>,
): Point[] {
  const edgeStyle = style.edgeStyle ?? ''
  const isTerminal = (t: Terminal | Point): t is Terminal => 'bounds' in t
  const anchor = (t: Terminal | Point): Point => (isTerminal(t) ? centre(t.bounds) : t)

  if (edgeStyle === 'entityRelationEdgeStyle' && isTerminal(source) && isTerminal(target)) {
    const seg = numberOf(style, 'segment', 30, 0, 200)
    const s = source.bounds
    const t = target.bounds
    // Shapes stacked one above the other: out of one side and back into the same side.
    const overlap = Math.min(s.x + s.width, t.x + t.width) - Math.max(s.x, t.x) > 0
    if (overlap && !portPoint(source) && !portPoint(target)) {
      const x = Math.max(s.x + s.width, t.x + t.width) + seg
      const sp = { x: s.x + s.width, y: centre(s).y }
      const tp = { x: t.x + t.width, y: centre(t).y }
      return dedupe([sp, { x, y: sp.y }, { x, y: tp.y }, tp])
    }
    const leftToRight = centre(s).x <= centre(t).x
    const sp = portPoint(source) ?? { x: leftToRight ? s.x + s.width : s.x, y: centre(s).y }
    const tp = portPoint(target) ?? { x: leftToRight ? t.x : t.x + t.width, y: centre(t).y }
    const sx = sp.x + (leftToRight ? seg : -seg)
    const tx = tp.x + (leftToRight ? -seg : seg)
    return dedupe([sp, { x: sx, y: sp.y }, { x: tx, y: tp.y }, tp])
  }

  if (edgeStyle === 'orthogonalEdgeStyle' || edgeStyle === 'elbowEdgeStyle' || edgeStyle === 'segmentEdgeStyle') {
    const firstTarget = waypoints[0] ?? anchor(target)
    const lastSource = waypoints[waypoints.length - 1] ?? anchor(source)
    const start = isTerminal(source) ? orthogonalExit(source, firstTarget) : source
    const end = isTerminal(target) ? orthogonalExit(target, lastSource) : target
    if (waypoints.length === 0) {
      const vertical = edgeStyle === 'elbowEdgeStyle' ? style.elbow === 'vertical' : isTerminal(source) && (sideOf(source.bounds, start) === 'top' || sideOf(source.bounds, start) === 'bottom')
      if (start.x === end.x || start.y === end.y) return dedupe([start, end])
      const endVertical = isTerminal(target) && (sideOf(target.bounds, end) === 'top' || sideOf(target.bounds, end) === 'bottom')
      if (vertical !== endVertical) return dedupe([start, vertical ? { x: start.x, y: end.y } : { x: end.x, y: start.y }, end])
      if (vertical) {
        const my = (start.y + end.y) / 2
        return dedupe([start, { x: start.x, y: my }, { x: end.x, y: my }, end])
      }
      const mx = (start.x + end.x) / 2
      return dedupe([start, { x: mx, y: start.y }, { x: mx, y: end.y }, end])
    }
    const startHorizontal = isTerminal(source) ? !(sideOf(source.bounds, start) === 'top' || sideOf(source.bounds, start) === 'bottom') : Math.abs(firstTarget.x - start.x) >= Math.abs(firstTarget.y - start.y)
    return orthogonalise([start, ...waypoints, end], startHorizontal)
  }

  // Straight segments through the waypoints.
  const first = waypoints[0] ?? anchor(target)
  const last = waypoints[waypoints.length - 1] ?? anchor(source)
  const start = isTerminal(source) ? (portPoint(source) ?? perimeter(source.bounds, source.shape, first)) : source
  const end = isTerminal(target) ? (portPoint(target) ?? perimeter(target.bounds, target.shape, last)) : target
  return dedupe([start, ...waypoints, end])
}

/** A path through the points: straight, with rounded corners, or curved. */
export function edgePath(points: Point[], style: Record<string, string>): string {
  const p = new PathBuilder()
  if (points.length === 0) return ''
  p.moveTo(points[0]!.x, points[0]!.y)
  if (style.curved === '1' && points.length > 2) {
    for (let i = 1; i < points.length - 1; i++) {
      const c = points[i]!
      const n = points[i + 1]!
      const end = i === points.length - 2 ? n : { x: (c.x + n.x) / 2, y: (c.y + n.y) / 2 }
      p.quadTo(c.x, c.y, end.x, end.y)
    }
    return p.toString()
  }
  const radius = style.rounded === '1' ? numberOf(style, 'arcSize', 20, 0, 200) / 2 : 0
  for (let i = 1; i < points.length; i++) {
    const c = points[i]!
    const n = points[i + 1]
    if (radius > 0 && n) {
      const a = points[i - 1]!
      const inLen = Math.hypot(c.x - a.x, c.y - a.y)
      const outLen = Math.hypot(n.x - c.x, n.y - c.y)
      const r = Math.min(radius, inLen / 2, outLen / 2)
      if (r > 0.5) {
        const b1 = { x: c.x - ((c.x - a.x) / inLen) * r, y: c.y - ((c.y - a.y) / inLen) * r }
        const b2 = { x: c.x + ((n.x - c.x) / outLen) * r, y: c.y + ((n.y - c.y) / outLen) * r }
        p.lineTo(b1.x, b1.y).quadTo(c.x, c.y, b2.x, b2.y)
        continue
      }
    }
    p.lineTo(c.x, c.y)
  }
  return p.toString()
}

/** How far a marker reaches back from the tip: the line stops there. */
export function markerInset(type: string | undefined, size: number): number {
  switch (type) {
    case 'classic':
    case 'classicThin':
      return size * 1.2
    case 'block':
    case 'blockThin':
      return size * 1.6
    case 'diamond':
    case 'diamondThin':
      return size * 2.2
    case 'oval':
    case 'circle':
      return size
    default:
      return 0
  }
}

/**
 * The marker at the end of a connector whose last segment points along `d`
 * (a unit vector) to `tip`. `fill` is `true` for the solid variant.
 */
export function marker(type: string | undefined, tip: Point, d: Point, size: number, fill: boolean, stroke: string, width: number): SvgElement[] {
  if (!type || type === 'none') return []
  const n = { x: -d.y, y: d.x }
  const at = (back: number, side: number): [number, number] => [tip.x - d.x * back + n.x * side, tip.y - d.y * back + n.y * side]
  const shape = (pts: [number, number][], closed: boolean, solid: boolean): SvgElement => {
    const p = new PathBuilder()
    pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)))
    if (closed) p.close()
    return el('path', {
      d: p.toString(),
      fill: closed ? (solid ? stroke : 'var(--drawio-label-background, #ffffff)') : 'none',
      stroke,
      'stroke-width': width,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    })
  }
  const len = size * 1.6
  const half = size * (type.endsWith('Thin') ? 0.45 : 0.7)
  switch (type) {
    case 'classic':
    case 'classicThin':
      return [shape([at(0, 0), at(len, half), at(len * 0.75, 0), at(len, -half)], true, fill)]
    case 'block':
    case 'blockThin':
      return [shape([at(0, 0), at(len, half), at(len, -half)], true, fill)]
    case 'open':
    case 'openThin':
      return [shape([at(len, half), at(0, 0), at(len, -half)], false, false)]
    case 'async':
      return [shape([at(0, 0), at(len, half), at(len, 0)], true, fill)]
    case 'diamond':
    case 'diamondThin':
      return [shape([at(0, 0), at(len * 0.7, half), at(len * 1.4, 0), at(len * 0.7, -half)], true, fill)]
    case 'oval':
    case 'circle': {
      const [cx, cy] = at(size / 2, 0)
      return [el('circle', { cx, cy, r: size / 2, fill: fill ? stroke : 'var(--drawio-label-background, #ffffff)', stroke, 'stroke-width': width })]
    }
    case 'dash':
      return [shape([at(size, size), at(size, -size)], false, false)]
    case 'cross':
      return [shape([at(len, half), at(0, -half)], false, false), shape([at(len, -half), at(0, half)], false, false)]
    case 'ERone':
      return [shape([at(size * 1.6, size), at(size * 1.6, -size)], false, false)]
    case 'ERmandOne':
      return [shape([at(size * 1.2, size), at(size * 1.2, -size)], false, false), shape([at(size * 2, size), at(size * 2, -size)], false, false)]
    case 'ERmany':
      return [shape([at(0, size), at(size * 1.6, 0), at(0, -size)], false, false)]
    case 'ERoneToMany':
      return [shape([at(0, size), at(size * 1.6, 0), at(0, -size)], false, false), shape([at(size * 2, size), at(size * 2, -size)], false, false)]
    case 'ERzeroToMany': {
      const [cx, cy] = at(size * 2.6, 0)
      return [shape([at(0, size), at(size * 1.6, 0), at(0, -size)], false, false), el('circle', { cx, cy, r: size * 0.6, fill: 'var(--drawio-label-background, #ffffff)', stroke, 'stroke-width': width })]
    }
    case 'ERzeroToOne': {
      const [cx, cy] = at(size * 2.6, 0)
      return [shape([at(size * 1.2, size), at(size * 1.2, -size)], false, false), el('circle', { cx, cy, r: size * 0.6, fill: 'var(--drawio-label-background, #ffffff)', stroke, 'stroke-width': width })]
    }
    default:
      return [shape([at(len, half), at(0, 0), at(len, -half)], false, false)]
  }
}

/** The point at `fraction` (0…1) of a path's length, and the direction there. */
export function along(points: Point[], fraction: number): { point: Point; dir: Point } {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  let left = total * Math.min(1, Math.max(0, fraction))
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (left <= len && len > 0) return { point: { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len }, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } }
    left -= len
  }
  const a = points[points.length - 2] ?? points[0]!
  const b = points[points.length - 1]!
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { point: b, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } }
}
