/**
 * A minimal SVG builder.
 *
 * Every diagram is assembled as a tree of these nodes and serialised once.
 * The builder is the security boundary of the package: text content and
 * attribute values are escaped here and nowhere else, so a label can never
 * become markup. Tag and attribute names come from code, but are checked
 * anyway — a typo should fail loudly, not produce a malformed document.
 */

export type AttrValue = string | number | boolean | null | undefined

export interface SvgElement {
  readonly tag: string
  readonly attrs: Readonly<Record<string, AttrValue>>
  readonly children: readonly SvgChild[]
}

/** Raw text inside an element; escaped on serialisation. */
export interface SvgText {
  readonly text: string
}

export type SvgChild = SvgElement | SvgText

const NAME = /^[a-zA-Z][a-zA-Z0-9:_-]*$/

export function el(
  tag: string,
  attrs: Record<string, AttrValue> = {},
  children: readonly (SvgChild | null | undefined | false)[] = [],
): SvgElement {
  if (!NAME.test(tag)) {
    throw new Error(`Invalid SVG tag name: ${tag}`)
  }
  return {
    tag,
    attrs,
    children: children.filter((child): child is SvgChild => !!child),
  }
}

export function txt(text: string): SvgText {
  return { text }
}

export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'))
}

export function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/**
 * Numbers rounded to two decimals: enough for a screen, and it keeps the
 * output identical across engines whose floating point differs in the last bits.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function attrString(attrs: Readonly<Record<string, AttrValue>>): string {
  let out = ''
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) {
      continue
    }
    if (!NAME.test(name)) {
      throw new Error(`Invalid SVG attribute name: ${name}`)
    }
    if (value === true) {
      out += ` ${name}=""`
    } else if (typeof value === 'number') {
      out += ` ${name}="${num(value)}"`
    } else {
      out += ` ${name}="${escapeAttr(value)}"`
    }
  }
  return out
}

export function serialize(node: SvgChild): string {
  if ('text' in node) {
    return escapeText(node.text)
  }
  const attrs = attrString(node.attrs)
  if (node.children.length === 0) {
    return `<${node.tag}${attrs}/>`
  }
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`
}

/** Path data from a list of commands; numbers formatted with {@link num}. */
export class PathBuilder {
  private parts: string[] = []

  moveTo(x: number, y: number): this {
    this.parts.push(`M${num(x)},${num(y)}`)
    return this
  }

  lineTo(x: number, y: number): this {
    this.parts.push(`L${num(x)},${num(y)}`)
    return this
  }

  curveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.parts.push(`C${num(c1x)},${num(c1y)} ${num(c2x)},${num(c2y)} ${num(x)},${num(y)}`)
    return this
  }

  quadTo(cx: number, cy: number, x: number, y: number): this {
    this.parts.push(`Q${num(cx)},${num(cy)} ${num(x)},${num(y)}`)
    return this
  }

  arcTo(
    rx: number,
    ry: number,
    rotation: number,
    largeArc: boolean,
    sweep: boolean,
    x: number,
    y: number,
  ): this {
    this.parts.push(
      `A${num(rx)},${num(ry)} ${num(rotation)} ${largeArc ? 1 : 0},${sweep ? 1 : 0} ${num(x)},${num(y)}`,
    )
    return this
  }

  close(): this {
    this.parts.push('Z')
    return this
  }

  toString(): string {
    return this.parts.join(' ')
  }
}
