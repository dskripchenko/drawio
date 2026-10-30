/**
 * Raw DEFLATE (RFC 1951) decompression and base64 decoding — what draw.io
 * uses for compressed pages — without dependencies.
 *
 * Output is capped: a few kilobytes of compressed data can expand to
 * gigabytes, and a diagram never needs that.
 */
import { DrawioError } from './errors'

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

/** A canonical Huffman code: how many codes of each length, and the symbols in code order. */
interface Huffman {
  counts: Uint16Array
  symbols: Uint16Array
}

function huffman(lengths: ArrayLike<number>, n: number): Huffman {
  const counts = new Uint16Array(16)
  for (let i = 0; i < n; i++) counts[lengths[i]!]!++
  counts[0] = 0
  const offsets = new Uint16Array(16)
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1]! + counts[i - 1]!
  const symbols = new Uint16Array(n)
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offsets[lengths[i]!]!++] = i
  return { counts, symbols }
}

let FIXED: { lit: Huffman; dist: Huffman } | undefined
function fixed(): { lit: Huffman; dist: Huffman } {
  if (FIXED) return FIXED
  const l = new Uint8Array(288)
  for (let i = 0; i < 144; i++) l[i] = 8
  for (let i = 144; i < 256; i++) l[i] = 9
  for (let i = 256; i < 280; i++) l[i] = 7
  for (let i = 280; i < 288; i++) l[i] = 8
  const d = new Uint8Array(30).fill(5)
  FIXED = { lit: huffman(l, 288), dist: huffman(d, 30) }
  return FIXED
}

/** Inflates raw DEFLATE data. Throws on corrupt input or when the output would exceed `maxOutput` bytes. */
export function inflateRaw(input: Uint8Array, maxOutput = 50_000_000): Uint8Array {
  let pos = 0
  let bitBuf = 0
  let bitCount = 0
  let out = new Uint8Array(Math.min(maxOutput, Math.max(1024, input.length * 4)))
  let outLen = 0

  const corrupt = (): never => {
    throw new DrawioError('A compressed page is corrupt')
  }
  const bits = (n: number): number => {
    while (bitCount < n) {
      if (pos >= input.length) corrupt()
      bitBuf |= input[pos++]! << bitCount
      bitCount += 8
    }
    const v = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCount -= n
    return v
  }
  const ensure = (extra: number) => {
    if (outLen + extra <= out.length) return
    if (outLen + extra > maxOutput) throw new DrawioError(`A compressed page expands beyond ${maxOutput} bytes`)
    let size = out.length * 2
    while (size < outLen + extra) size *= 2
    const next = new Uint8Array(Math.min(size, maxOutput))
    next.set(out.subarray(0, outLen))
    out = next
  }
  const decode = (h: Huffman): number => {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len < 16; len++) {
      code |= bits(1)
      const count = h.counts[len]!
      if (code - count < first) return h.symbols[index + (code - first)]!
      index += count
      first += count
      first <<= 1
      code <<= 1
    }
    return corrupt()
  }

  for (;;) {
    const last = bits(1)
    const type = bits(2)
    if (type === 0) {
      // Stored: byte-aligned length, its complement, then raw bytes.
      bitBuf = 0
      bitCount = 0
      if (pos + 4 > input.length) corrupt()
      const len = input[pos]! | (input[pos + 1]! << 8)
      const nlen = input[pos + 2]! | (input[pos + 3]! << 8)
      if ((len ^ 0xffff) !== nlen) corrupt()
      pos += 4
      if (pos + len > input.length) corrupt()
      ensure(len)
      out.set(input.subarray(pos, pos + len), outLen)
      outLen += len
      pos += len
    } else if (type === 1 || type === 2) {
      let lit: Huffman
      let dist: Huffman
      if (type === 1) {
        ;({ lit, dist } = fixed())
      } else {
        const hlit = bits(5) + 257
        const hdist = bits(5) + 1
        const hclen = bits(4) + 4
        const cl = new Uint8Array(19)
        for (let i = 0; i < hclen; i++) cl[CODE_LENGTH_ORDER[i]!] = bits(3)
        const clh = huffman(cl, 19)
        const lengths = new Uint8Array(hlit + hdist)
        for (let i = 0; i < hlit + hdist; ) {
          const sym = decode(clh)
          if (sym < 16) lengths[i++] = sym
          else {
            let repeat: number
            let value = 0
            if (sym === 16) {
              if (i === 0) corrupt()
              value = lengths[i - 1]!
              repeat = 3 + bits(2)
            } else if (sym === 17) repeat = 3 + bits(3)
            else repeat = 11 + bits(7)
            if (i + repeat > hlit + hdist) corrupt()
            lengths.fill(value, i, i + repeat)
            i += repeat
          }
        }
        lit = huffman(lengths.subarray(0, hlit), hlit)
        dist = huffman(lengths.subarray(hlit), hdist)
      }
      for (;;) {
        const sym = decode(lit)
        if (sym < 256) {
          ensure(1)
          out[outLen++] = sym
        } else if (sym === 256) {
          break
        } else {
          const li = sym - 257
          if (li >= 29) corrupt()
          const length = LENGTH_BASE[li]! + bits(LENGTH_EXTRA[li]!)
          const di = decode(dist)
          if (di >= 30) corrupt()
          const distance = DIST_BASE[di]! + bits(DIST_EXTRA[di]!)
          if (distance > outLen) corrupt()
          ensure(length)
          for (let i = 0; i < length; i++, outLen++) out[outLen] = out[outLen - distance]!
        }
      }
    } else {
      corrupt()
    }
    if (last) break
  }
  return out.subarray(0, outLen)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INDEX = new Int16Array(128).fill(-1)
for (let i = 0; i < 64; i++) B64_INDEX[B64.charCodeAt(i)] = i
B64_INDEX['-'.charCodeAt(0)] = 62
B64_INDEX['_'.charCodeAt(0)] = 63

/** Decodes base64 (standard or URL-safe), ignoring whitespace. */
export function base64Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s=]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buf = 0
  let n = 0
  let o = 0
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i)
    const v = c < 128 ? B64_INDEX[c]! : -1
    if (v < 0) throw new DrawioError('A compressed page is not valid base64')
    buf = (buf << 6) | v
    n += 6
    if (n >= 8) {
      n -= 8
      out[o++] = (buf >> n) & 0xff
    }
  }
  return out.subarray(0, o)
}

/** UTF-8 bytes to a string. */
export function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * A compressed draw.io page — base64 of raw DEFLATE of the URI-encoded
 * XML — back to its XML.
 */
export function decompressPage(text: string, maxOutput?: number): string {
  const inflated = utf8(inflateRaw(base64Decode(text.trim()), maxOutput))
  try {
    return decodeURIComponent(inflated)
  } catch {
    // Some writers skip the URI encoding.
    return inflated
  }
}
