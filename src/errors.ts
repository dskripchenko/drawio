/**
 * The one error the package throws for a file it cannot read or draw.
 *
 * A draw.io file is usually saved by a tool, but edited or generated often enough
 * that the useful answer to "it does not render" is where and why.
 */
export class DrawioError extends Error {
  override readonly name = 'DrawioError'

  /**
   * @param message What is wrong, in a sentence.
   * @param line 1-based line of the file, or 0 when the error is about the whole file.
   * @param column 1-based column, or 0 when unknown.
   * @param hint What to do about it, when there is an obvious answer.
   */
  constructor(
    message: string,
    readonly line = 0,
    readonly column = 0,
    readonly hint?: string,
  ) {
    super(line > 0 ? `${message} (line ${line}${column > 0 ? `, column ${column}` : ''})` : message)
  }
}
