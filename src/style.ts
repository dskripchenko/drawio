/**
 * Values of a cell's style, read safely: colours are validated, numbers
 * bounded. What the file does not set falls back to a CSS custom property,
 * so a page can retheme diagrams that use the default colours.
 */

const NAMED = /^[a-zA-Z]{3,24}$/
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const NUMBER = String.raw`\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:%|deg)?\s*`
const FUNCTION = new RegExp(`^(?:rgba?|hsla?)\\((?:${NUMBER},){2,3}${NUMBER}\\)$|^(?:rgba?|hsla?)\\((?:${NUMBER}){3}(?:/${NUMBER})?\\)$`, 'i')

/** A plain colour value — hex, a name, `rgb()`/`hsl()` of numbers — or undefined. */
export function safeColor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const v = value.trim()
  if (HEX.test(v) || FUNCTION.test(v)) return v
  if (NAMED.test(v) && !/^(?:inherit|initial|unset|revert|var|url|expression|none|default)$/i.test(v)) return v
  return undefined
}

/** Variable name → light default: the colours used where the file sets none. */
export const VARIABLES: Readonly<Record<string, string>> = {
  '--drawio-font-family': 'Helvetica, Arial, sans-serif',
  '--drawio-background': 'transparent',
  '--drawio-fill': '#ffffff',
  '--drawio-stroke': '#000000',
  '--drawio-text': '#000000',
  '--drawio-label-background': '#ffffff',
  '--drawio-placeholder': '#9ca3af',
}

export function v(name: string): string {
  return `var(${name}, ${VARIABLES[name]})`
}

/**
 * A colour from the style: `none` (draw nothing), the file's colour, or the
 * themeable default. `default` is draw.io's own word for "the theme's colour".
 */
export function colorOf(style: Record<string, string>, key: string, fallback: string): string {
  const raw = style[key]
  if (raw === undefined || raw === '' || raw === 'default') return fallback
  if (raw === 'none') return 'none'
  return safeColor(raw) ?? fallback
}

export function numberOf(style: Record<string, string>, key: string, fallback: number, min = -1e6, max = 1e6): number {
  const raw = style[key]
  const n = raw === undefined ? NaN : Number(raw)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function flagOf(style: Record<string, string>, key: string, fallback = false): boolean {
  const raw = style[key]
  return raw === undefined ? fallback : raw === '1' || raw === 'true'
}

/** A dash pattern of numbers only. */
export function dashOf(style: Record<string, string>, width: number): string | undefined {
  if (!flagOf(style, 'dashed')) return undefined
  const pattern = style.dashPattern
  if (pattern && /^[\d.\s]+$/.test(pattern)) return pattern.trim().split(/\s+/).map((n) => Number(n) * width).join(' ')
  return `${3 * width} ${3 * width}`
}

export function stylesheet(rootId: string): string {
  const r = `#${rootId}`
  return [`${r}{font-family:${v('--drawio-font-family')};background:${v('--drawio-background')}}`, `${r} text{white-space:pre}`, `${r} a{cursor:pointer}`].join('')
}
