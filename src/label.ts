/**
 * Labels: draw.io stores HTML in them (`html=1`). None of it reaches the
 * output as markup. The text is read out with the few things that matter
 * for reading it — line breaks, bold, italic, underline, colour, size,
 * list bullets — and everything else is dropped.
 */
import type { FontSpec, TextMeasurer } from './core/text'
import { safeColor } from './style'

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  /** Pixels. */
  size?: number
}

export type Line = Run[]

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', deg: '°', times: '×', rarr: '→', larr: '←', euro: '€' }

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Plain text (`html=0`): lines at newlines. */
export function plainLines(text: string): Line[] {
  return text.split(/\r\n|\r|\n/).map((t) => (t ? [{ text: t }] : []))
}

const BLOCK = new Set(['div', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'ul', 'ol', 'table', 'blockquote', 'pre'])
const FONT_SIZES = [10, 13, 16, 18, 24, 32, 48]

function styleOf(style: string): Partial<Run> {
  const out: Partial<Run> = {}
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const k = decl.slice(0, i).trim().toLowerCase()
    const v = decl.slice(i + 1).trim()
    if (k === 'color') out.color = safeColor(v)
    else if (k === 'font-weight') out.bold = v === 'bold' || Number(v) >= 600
    else if (k === 'font-style') out.italic = v === 'italic' || v === 'oblique'
    else if (k === 'text-decoration' || k === 'text-decoration-line') out.underline = v.includes('underline')
    else if (k === 'font-size') {
      const px = /^([\d.]+)px$/.exec(v)
      if (px) out.size = Math.min(200, Number(px[1]))
    }
  }
  return out
}

/** HTML label text → lines of styled runs. */
export function htmlLines(html: string): Line[] {
  const lines: Line[] = [[]]
  const stack: { tag: string; style: Partial<Run> }[] = []
  const current = (): Partial<Run> => Object.assign({}, ...stack.map((s) => s.style))
  const newline = () => {
    lines.push([])
  }
  const blockBreak = () => {
    if (lines[lines.length - 1]!.length > 0) newline()
  }
  const add = (text: string) => {
    if (!text) return
    const s = current()
    const run: Run = { text }
    if (s.bold) run.bold = true
    if (s.italic) run.italic = true
    if (s.underline) run.underline = true
    if (s.color) run.color = s.color
    if (s.size) run.size = s.size
    lines[lines.length - 1]!.push(run)
  }
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)|</g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[3] !== undefined || m[0] === '<') {
      // HTML collapses whitespace; draw.io keeps &nbsp; for deliberate spaces.
      add(decodeEntities((m[3] ?? '<').replace(/[ \t\r\n]+/g, ' ')))
      continue
    }
    const tag = (m[1] ?? '').toLowerCase()
    if (!tag) continue
    const closing = m[0][1] === '/'
    if (tag === 'br') {
      newline()
      continue
    }
    if (closing) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag)
      if (i >= 0) stack.splice(i)
      if (BLOCK.has(tag)) blockBreak()
      continue
    }
    if (['script', 'style', 'title', 'head'].includes(tag)) {
      // Their content is not text: skip to the closing tag.
      const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex)
      re.lastIndex = end < 0 ? html.length : end
      continue
    }
    if (BLOCK.has(tag)) blockBreak()
    const attrs = m[2] ?? ''
    const attrOf = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
    const style: Partial<Run> = {}
    if (tag === 'b' || tag === 'strong' || /^h[1-6]$/.test(tag)) style.bold = true
    if (tag === 'i' || tag === 'em') style.italic = true
    if (tag === 'u') style.underline = true
    const css = attrOf('style')
    if (css) Object.assign(style, styleOf(decodeEntities(css[1] ?? css[2] ?? css[3] ?? '')))
    if (tag === 'font') {
      const color = attrOf('color')
      const c = color && safeColor(decodeEntities(color[1] ?? color[2] ?? color[3] ?? ''))
      if (c) style.color = c
      const size = attrOf('size')
      const n = size ? Number(size[1] ?? size[2] ?? size[3]) : NaN
      if (n >= 1 && n <= 7) style.size = FONT_SIZES[n - 1]
    }
    if (tag === 'li') add('• ')
    const voidTag = /\/>$/.test(m[0]) || ['img', 'hr', 'input', 'wbr', 'meta', 'link'].includes(tag)
    if (!voidTag) stack.push({ tag, style })
  }
  // Trim blank lines at the ends.
  while (lines.length > 1 && lines[lines.length - 1]!.every((r) => !r.text.trim())) lines.pop()
  while (lines.length > 1 && lines[0]!.every((r) => !r.text.trim())) lines.shift()
  return lines.map((l) => trimLine(l))
}

function trimLine(line: Line): Line {
  const out = line.map((r) => ({ ...r }))
  while (out.length > 0 && out[0]!.text.trim() === '') out.shift()
  while (out.length > 0 && out[out.length - 1]!.text.trim() === '') out.pop()
  if (out[0]) out[0].text = out[0].text.replace(/^ +/, '')
  if (out.length > 0) out[out.length - 1]!.text = out[out.length - 1]!.text.replace(/ +$/, '')
  return out
}

function runFont(run: Run, font: FontSpec): FontSpec {
  return { ...font, size: run.size ?? font.size, weight: run.bold ? 'bold' : font.weight, style: run.italic ? 'italic' : font.style }
}

export function lineWidth(line: Line, font: FontSpec, measure: TextMeasurer): number {
  return line.reduce((w, r) => w + measure(r.text, runFont(r, font)).width, 0)
}

export function lineHeight(line: Line, font: FontSpec): number {
  return Math.max(font.size, ...line.map((r) => r.size ?? font.size)) * 1.2
}

/** Wraps lines at spaces to `max` pixels; a word wider than that keeps its own line. */
export function wrapLines(lines: Line[], max: number, font: FontSpec, measure: TextMeasurer): Line[] {
  const out: Line[] = []
  for (const line of lines) {
    if (lineWidth(line, font, measure) <= max) {
      out.push(line)
      continue
    }
    const words: Run[][] = [[]]
    for (const run of line) {
      for (const part of run.text.split(/( +)/)) {
        if (/^ +$/.test(part)) words.push([])
        else if (part) words[words.length - 1]!.push({ ...run, text: part })
      }
    }
    let cur: Line = []
    let width = 0
    for (const word of words) {
      if (word.length === 0) continue
      const w = lineWidth(word, font, measure)
      const space = measure(' ', runFont(word[0]!, font)).width
      if (cur.length > 0 && width + space + w > max) {
        out.push(cur)
        cur = []
        width = 0
      }
      if (cur.length > 0) {
        cur.push({ ...word[0]!, text: ' ' })
        width += space
      }
      cur.push(...word)
      width += w
    }
    out.push(cur)
  }
  return out
}
