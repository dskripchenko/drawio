/**
 * @dskripchenko/drawio — draw.io (diagrams.net) files to SVG, with no
 * runtime dependencies and no DOM.
 *
 *     import { render } from '@dskripchenko/drawio'
 *     const { svg } = render(fileText)
 */
export { render } from './render'
export type { RenderOptions, RenderResult } from './render'
export { parseDrawio, parseStyle } from './model'
export type { DrawioFile, Page, Cell, Geometry, Bounds, Point, ParseOptions } from './model'
export { DrawioError } from './errors'
export { inflateRaw, base64Decode, decompressPage } from './inflate'
export { htmlLines, plainLines } from './label'
export type { Run, Line } from './label'
export { VARIABLES as THEME_VARIABLES, safeColor } from './style'
export { approximateMeasurer, defaultMeasurer } from './core/text'
export type { TextMeasurer, FontSpec, TextSize } from './core/text'
export { parseXml } from './xml'
