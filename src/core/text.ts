/**
 * Text: how wide a string is, and how a label wraps into a box.
 *
 * A BPMN file fixes every box, but not how its text breaks: that depends on
 * the font the reader's browser picks. So measuring is a pluggable function: the browser measures
 * with a canvas, everything else (SSR, Node, tests) uses a table of average
 * glyph widths that is close enough for boxes to fit with their padding.
 */

export interface FontSpec {
  /** Pixels. */
  size: number
  family: string
  weight?: 'normal' | 'bold'
  style?: 'normal' | 'italic'
}

export interface TextSize {
  width: number
  height: number
}

export type TextMeasurer = (text: string, font: FontSpec) => TextSize

export const LINE_HEIGHT = 1.25

// ---------------------------------------------------------------------------
// Approximate measurement
// ---------------------------------------------------------------------------

/*
 * Advance widths of Arial/Helvetica in 1/1000 em for printable ASCII (32–126).
 * The family that "sans-serif" resolves to on most systems has metrics close
 * to these; the error is a few percent, which the padding absorbs.
 */
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

const SYSTEM_FONT_FACTOR = 1.06

/* Cyrillic letters that are noticeably narrower or wider than the average. */
const CYRILLIC_NARROW = new Set('гзтэсеё'.split(''))
const CYRILLIC_WIDE = new Set('жмшщюыЖМШЩЮЫФф'.split(''))

function glyphWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  if (code >= 32 && code <= 126) {
    return ASCII_WIDTHS[code - 32] ?? 556
  }
  if (code >= 0x0400 && code <= 0x04ff) {
    if (CYRILLIC_WIDE.has(ch)) return 800
    if (CYRILLIC_NARROW.has(ch)) return 470
    return ch === ch.toUpperCase() ? 690 : 545
  }
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) {
    return 1000
  }
  if (code === 0x2014 || code === 0x2026) return 1000
  if (code === 0x2013) return 556
  if (code === 0xa0) return 278
  return 600
}

/**
 * Measures with a table of glyph widths. Deterministic, which also makes it
 * the measurer for tests and snapshots.
 */
export const approximateMeasurer: TextMeasurer = (text, font) => {
  let units = 0
  for (const ch of text) {
    units += glyphWidth(ch)
  }
  // The table is Arial's; the system UI fonts the stylesheet asks for first
  // (San Francisco, Segoe UI, Roboto) run a few percent wider.
  let width = (units / 1000) * font.size * SYSTEM_FONT_FACTOR
  if (font.weight === 'bold') {
    width *= 1.07
  }
  return { width, height: font.size * LINE_HEIGHT }
}

// ---------------------------------------------------------------------------
// Canvas measurement
// ---------------------------------------------------------------------------

interface Context2D {
  font: string
  measureText(text: string): { width: number }
}

let canvasContext: Context2D | null | undefined

function context(): Context2D | null {
  if (canvasContext !== undefined) {
    return canvasContext
  }
  canvasContext = null
  try {
    const g = globalThis as unknown as {
      OffscreenCanvas?: new (w: number, h: number) => { getContext(type: '2d'): Context2D | null }
      document?: { createElement(tag: 'canvas'): { getContext(type: '2d'): Context2D | null } }
      navigator?: { userAgent?: string }
    }
    // jsdom has a canvas element without an implementation and logs an error
    // when asked for a context; the glyph table is the measurer there.
    if (g.navigator?.userAgent?.includes('jsdom')) return canvasContext
    if (typeof g.OffscreenCanvas === 'function') {
      canvasContext = new g.OffscreenCanvas(1, 1).getContext('2d')
    } else if (g.document && typeof g.document.createElement === 'function') {
      canvasContext = g.document.createElement('canvas').getContext('2d')
    }
    // jsdom has a canvas element without an implementation; it measures 0.
    if (canvasContext && canvasContext.measureText('M').width <= 0) {
      canvasContext = null
    }
  } catch {
    canvasContext = null
  }
  return canvasContext
}

export function cssFont(font: FontSpec): string {
  return `${font.style === 'italic' ? 'italic ' : ''}${font.weight === 'bold' ? 'bold ' : ''}${font.size}px ${font.family}`
}

function cached(measure: TextMeasurer): TextMeasurer {
  const cache = new Map<string, TextSize>()
  return (text, font) => {
    const key = `${cssFont(font)}\u0000${text}`
    let size = cache.get(key)
    if (!size) {
      size = measure(text, font)
      if (cache.size > 5000) cache.clear()
      cache.set(key, size)
    }
    return size
  }
}

/**
 * The best measurer the environment offers: a canvas when there is one,
 * otherwise the glyph table.
 */
export function defaultMeasurer(): TextMeasurer {
  const ctx = context()
  if (!ctx) {
    return approximateMeasurer
  }
  return cached((text, font) => {
    ctx.font = cssFont(font)
    return { width: ctx.measureText(text).width, height: font.size * LINE_HEIGHT }
  })
}

/**
 * Breaks text into lines no wider than `maxWidth`, at spaces and at the
 * newlines the author typed. A word wider than the limit is split by
 * characters — in a fixed box an overflowing word would cover its neighbours.
 */
export function wrapText(text: string, maxWidth: number, font: FontSpec, measure: TextMeasurer): string[] {
  const out: string[] = []
  const width = (s: string) => measure(s, font).width
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (let word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (width(candidate) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) out.push(line)
      while (width(word) > maxWidth && word.length > 1) {
        let cut = word.length - 1
        while (cut > 1 && width(word.slice(0, cut)) > maxWidth) cut--
        out.push(word.slice(0, cut))
        word = word.slice(cut)
      }
      line = word
    }
    out.push(line)
  }
  // Blank lines at either end carry nothing.
  while (out.length > 1 && out[out.length - 1] === '') out.pop()
  while (out.length > 1 && out[0] === '') out.shift()
  return out
}
