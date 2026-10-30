/**
 * A small XML reader and writer, written for draw.io files.
 *
 * Safe by construction: a document type declaration is refused (no external
 * entities, no entity expansion), only the five predefined entities and
 * character references are decoded, and size and depth are capped. Lossless
 * enough to write a file back: elements of any namespace, attributes in their
 * order, text, CDATA, comments and processing instructions are all kept — a
 * file saved by another tool keeps its extensions after a round trip.
 */
import { DrawioError } from './errors'

export interface XmlAttribute {
  /** The qualified name as written: `camunda:assignee`. */
  name: string
  value: string
  /** The namespace URI of a prefixed name; `''` for an unprefixed attribute. */
  ns: string
  local: string
}

export interface XmlElement {
  kind: 'element'
  /** The qualified name as written: `mxCell`. */
  name: string
  /** The namespace URI the name resolves to; `''` when it has none. */
  ns: string
  local: string
  attributes: XmlAttribute[]
  children: XmlNode[]
  /** 1-based position of the start tag. */
  line: number
  column: number
}

export interface XmlText {
  kind: 'text' | 'cdata' | 'comment'
  value: string
}

export interface XmlInstruction {
  kind: 'instruction'
  target: string
  value: string
}

export type XmlNode = XmlElement | XmlText | XmlInstruction

export interface XmlDocument {
  /** Everything before the root element: the declaration, comments. */
  prolog: (XmlText | XmlInstruction)[]
  root: XmlElement
  /** Comments and instructions after the root element. */
  epilog: (XmlText | XmlInstruction)[]
}

export interface XmlLimits {
  /** Characters; default 20 000 000. */
  maxLength?: number
  /** Elements; default 200 000. */
  maxElements?: number
  /** Nesting; default 256. */
  maxDepth?: number
}

const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'

const NAME_START = String.raw`A-Za-z_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD`
const NAME_CHAR = String.raw`${NAME_START}\-.0-9\u00B7\u0300-\u036F\u203F-\u2040:`
// Combining marks (U+0300–036F) are name characters in XML; they follow a base letter here.
// eslint-disable-next-line no-misleading-character-class
const NAME = new RegExp(`[${NAME_START}:][${NAME_CHAR}]*`, 'y')

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function isChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  )
}

/** Parses an XML document. Throws {@link DrawioError} with the line and column of the fault. */
export function parseXml(source: string, limits: XmlLimits = {}): XmlDocument {
  const maxLength = limits.maxLength ?? 20_000_000
  const maxElements = limits.maxElements ?? 200_000
  const maxDepth = limits.maxDepth ?? 256
  if (typeof source !== 'string') throw new DrawioError('The diagram must be a string of XML')
  if (source.length > maxLength) {
    throw new DrawioError(`The file has ${source.length} characters; the limit is ${maxLength}`)
  }
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  let pos = 0
  let elements = 0

  // Offsets where lines start, for positions: found by binary search.
  const starts = [0]
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  const position = (at: number): { line: number; column: number } => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid]! <= at) lo = mid
      else hi = mid - 1
    }
    return { line: lo + 1, column: at - starts[lo]! + 1 }
  }
  const fail = (message: string, at = pos, hint?: string): never => {
    const { line, column } = position(at)
    throw new DrawioError(message, line, column, hint)
  }

  const name = (): string => {
    NAME.lastIndex = pos
    const m = NAME.exec(text)
    if (!m) fail('A name is expected here')
    pos += m![0].length
    return m![0]
  }
  const spaces = (): boolean => {
    const start = pos
    while (pos < text.length && /[ \t\r\n]/.test(text[pos]!)) pos++
    return pos > start
  }
  const expect = (literal: string) => {
    if (!text.startsWith(literal, pos)) fail(`"${literal}" is expected here`)
    pos += literal.length
  }

  /** Decodes references in text or an attribute value; checks characters. */
  const decode = (raw: string, at: number, attribute: boolean): string => {
    // Whitespace written literally is normalised — in attributes it becomes
    // spaces — but a reference such as "&#10;" keeps its character: that is
    // how modelers store line breaks in names.
    const literal = (part: string) => (attribute ? part.replace(/\r\n|[\r\n\t]/g, ' ') : part.replace(/\r\n?/g, '\n'))
    let out = ''
    let last = 0
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i)
      if (code === 0x26) {
        const end = raw.indexOf(';', i)
        if (end < 0) fail('An "&" must start a reference such as "&amp;"', at + i)
        const body = raw.slice(i + 1, end)
        let ch: string | undefined
        if (body.startsWith('#x')) {
          const n = /^[0-9a-fA-F]+$/.test(body.slice(2)) ? parseInt(body.slice(2), 16) : NaN
          ch = isChar(n) ? String.fromCodePoint(n) : undefined
        } else if (body.startsWith('#')) {
          const n = /^[0-9]+$/.test(body.slice(1)) ? parseInt(body.slice(1), 10) : NaN
          ch = isChar(n) ? String.fromCodePoint(n) : undefined
        } else {
          ch = ENTITIES[body]
        }
        if (ch === undefined) fail(`"&${body};" is not a known reference`, at + i, 'Only &lt; &gt; &amp; &quot; &apos; and &#…; are allowed.')
        out += literal(raw.slice(last, i)) + ch
        i = end
        last = end + 1
        continue
      }
      if (attribute && code === 0x3c) fail('"<" is not allowed in an attribute value', at + i)
      if (!isChar(code) && !(code >= 0xd800 && code <= 0xdfff)) fail('The file contains a character XML does not allow', at + i)
    }
    return out + literal(raw.slice(last))
  }

  /** A comment, instruction, CDATA section or doctype at `pos`; null for anything else. */
  const misc = (inContent: boolean): XmlText | XmlInstruction | null => {
    if (text.startsWith('<!--', pos)) {
      const end = text.indexOf('-->', pos + 4)
      if (end < 0) fail('A comment is never closed')
      const value = text.slice(pos + 4, end)
      if (value.includes('--')) fail('"--" is not allowed inside a comment')
      pos = end + 3
      return { kind: 'comment', value }
    }
    if (text.startsWith('<?', pos)) {
      const start = pos
      pos += 2
      const target = name()
      if (target.toLowerCase() === 'xml' && start !== 0) fail('The XML declaration must come first', start)
      const end = text.indexOf('?>', pos)
      if (end < 0) fail('A processing instruction is never closed', start)
      const value = text.slice(pos, end).trim()
      pos = end + 2
      return { kind: 'instruction', target, value }
    }
    if (inContent && text.startsWith('<![CDATA[', pos)) {
      const end = text.indexOf(']]>', pos + 9)
      if (end < 0) fail('A CDATA section is never closed')
      const value = text.slice(pos + 9, end).replace(/\r\n?/g, '\n')
      pos = end + 3
      return { kind: 'cdata', value }
    }
    if (text.startsWith('<!DOCTYPE', pos) || text.startsWith('<!ENTITY', pos)) {
      fail('Document type declarations are not accepted', pos, 'Remove the <!DOCTYPE …> line: draw.io files do not need it.')
    }
    return null
  }

  type Scope = Map<string, string>
  const element = (parent: Scope, depth: number): XmlElement => {
    if (depth > maxDepth) fail(`Elements are nested deeper than ${maxDepth} levels`)
    if (++elements > maxElements) fail(`The file has more than ${maxElements} elements`)
    const start = pos
    expect('<')
    const qname = name()
    const raw: { name: string; value: string; at: number }[] = []
    for (;;) {
      const had = spaces()
      if (text.startsWith('/>', pos) || text.startsWith('>', pos)) break
      if (!had) fail('A space is expected between attributes')
      const at = pos
      const attr = name()
      spaces()
      expect('=')
      spaces()
      const quote = text[pos]
      if (quote !== '"' && quote !== "'") fail('An attribute value must be quoted')
      const end = text.indexOf(quote!, pos + 1)
      if (end < 0) fail('An attribute value is never closed')
      const value = decode(text.slice(pos + 1, end), pos + 1, true)
      pos = end + 1
      if (raw.some((a) => a.name === attr)) fail(`The attribute "${attr}" is repeated`, at)
      raw.push({ name: attr, value, at })
    }
    // Namespace declarations first: they apply to the element's own name.
    let scope = parent
    for (const a of raw) {
      if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) {
        if (scope === parent) scope = new Map(parent)
        const prefix = a.name === 'xmlns' ? '' : a.name.slice(6)
        if (prefix && a.value === '') fail(`The prefix "${prefix}" cannot be undeclared`, a.at)
        scope.set(prefix, a.value)
      }
    }
    const resolve = (qn: string, at: number, attribute: boolean): { ns: string; local: string } => {
      const colon = qn.indexOf(':')
      if (colon < 0) return { ns: attribute ? '' : (scope.get('') ?? ''), local: qn }
      const prefix = qn.slice(0, colon)
      const local = qn.slice(colon + 1)
      if (prefix === 'xml') return { ns: XML_NS, local }
      if (prefix === 'xmlns') return { ns: XMLNS_NS, local }
      const ns = scope.get(prefix)
      if (ns === undefined) fail(`The prefix "${prefix}" is not declared`, at, `Add xmlns:${prefix}="…" to the root element.`)
      return { ns: ns!, local }
    }
    const own = resolve(qname, start + 1, false)
    const attributes: XmlAttribute[] = raw.map((a) => {
      if (a.name === 'xmlns') return { name: a.name, value: a.value, ns: XMLNS_NS, local: 'xmlns' }
      return { name: a.name, value: a.value, ...resolve(a.name, a.at, true) }
    })
    const { line, column } = position(start)
    const node: XmlElement = { kind: 'element', name: qname, ...own, attributes, children: [], line, column }
    if (text.startsWith('/>', pos)) {
      pos += 2
      return node
    }
    pos += 1
    for (;;) {
      if (pos >= text.length) fail(`<${qname}> is never closed`, start)
      const lt = text.indexOf('<', pos)
      if (lt !== pos) {
        const end = lt < 0 ? text.length : lt
        const chunk = text.slice(pos, end)
        if (chunk.includes(']]>')) fail('"]]>" is not allowed in text', pos + chunk.indexOf(']]>'))
        node.children.push({ kind: 'text', value: decode(chunk, pos, false) })
        pos = end
        continue
      }
      if (text.startsWith('</', pos)) {
        pos += 2
        const close = name()
        if (close !== qname) fail(`</${close}> closes <${qname}>`, pos - close.length - 2)
        spaces()
        expect('>')
        return node
      }
      const other = misc(true)
      if (other) {
        node.children.push(other)
        continue
      }
      node.children.push(element(scope, depth + 1))
    }
  }

  const prolog: (XmlText | XmlInstruction)[] = []
  const epilog: (XmlText | XmlInstruction)[] = []
  const base: Scope = new Map([['xml', XML_NS]])
  let root: XmlElement | undefined
  for (;;) {
    spaces()
    if (pos >= text.length) break
    const other = misc(false)
    if (other) {
      ;(root ? epilog : prolog).push(other)
      continue
    }
    if (text[pos] !== '<') fail('Text is not allowed outside the root element')
    if (root) fail('A document has one root element')
    root = element(base, 1)
  }
  if (!root) fail('The file has no XML element', 0, 'A draw.io file starts with <mxfile> or <mxGraphModel>.')
  return { prolog, root: root!, epilog }
}

function escape(value: string, attribute: boolean): string {
  return value.replace(attribute ? /[&<>"\n\r\t]/g : /[&<>\r]/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case '\n':
        return '&#10;'
      case '\r':
        return '&#13;'
      default:
        return '&#9;'
    }
  })
}

function writeNode(node: XmlNode): string {
  switch (node.kind) {
    case 'text':
      return escape(node.value, false)
    case 'cdata':
      // A "]]>" inside is split across two sections.
      return `<![CDATA[${node.value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
    case 'comment':
      return `<!--${node.value.replace(/--/g, '- -')}-->`
    case 'instruction':
      return `<?${node.target}${node.value ? ` ${node.value.replace(/\?>/g, '? >')}` : ''}?>`
    case 'element': {
      const attrs = node.attributes.map((a) => ` ${a.name}="${escape(a.value, true)}"`).join('')
      if (node.children.length === 0) return `<${node.name}${attrs} />`
      return `<${node.name}${attrs}>${node.children.map(writeNode).join('')}</${node.name}>`
    }
  }
}

/** Writes a document back to text. Text inside elements is kept as it was read. */
export function writeXml(doc: XmlDocument): string {
  const lines: string[] = []
  for (const n of doc.prolog) lines.push(writeNode(n))
  lines.push(writeNode(doc.root))
  for (const n of doc.epilog) lines.push(writeNode(n))
  return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// Helpers for readers of the tree
// ---------------------------------------------------------------------------

export function attr(element: XmlElement, name: string, ns = ''): string | undefined {
  for (const a of element.attributes) if (a.local === name && a.ns === ns) return a.value
  return undefined
}

export function childElements(element: XmlElement, ns?: string, local?: string): XmlElement[] {
  const out: XmlElement[] = []
  for (const c of element.children) {
    if (c.kind !== 'element') continue
    if (ns !== undefined && c.ns !== ns) continue
    if (local !== undefined && c.local !== local) continue
    out.push(c)
  }
  return out
}

/** The text of an element and its descendants, CDATA included. */
export function textContent(element: XmlElement): string {
  let out = ''
  for (const c of element.children) {
    if (c.kind === 'text' || c.kind === 'cdata') out += c.value
    else if (c.kind === 'element') out += textContent(c)
  }
  return out
}
