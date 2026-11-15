import { ErrorFactory } from '@exemplarjs/xml/internal';

export { XPathErrorCode } from '@exemplarjs/xdm';

/** Where in an expression's text an error was found, counted from 1. */
export interface TextPosition {
  readonly line: number;
  readonly column: number;
}

/** A span of an expression's text: the offset of its first character and the offset just past its last. */
export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * An error raised compiling or running an expression: a standard code such as `XPST0003`, or one
 * given to `fn:error` as `Q{uri}local`, its description, and for a static error where it was found.
 *
 * @example
 * try { new XPathCompiler().compile('count($chep)'); } catch (error) {
 *   if (error instanceof XPathException) console.log(error.code, error.description, error.offset);
 * } // XPST0008 The variable $chep is not declared { start: 6, end: 11 }
 */
// eslint-disable-next-line unicorn/custom-error-definition -- named as the API decisions chose, Java style
export class XPathException extends Error {
  readonly code: string;
  /** What went wrong, without the code or the position the message adds. */
  readonly description: string;
  /** The span of the expression's text where the error was found, when it was found there. */
  readonly offset: TextSpan | undefined;
  /** The line and column where `offset` starts, when it is known. */
  readonly position: TextPosition | undefined;
  /** The value `fn:error` was given, if any. */
  readonly value: unknown;

  constructor(code: string, description: string, offset?: TextSpan, text?: string, value?: unknown) {
    let position: TextPosition | undefined;
    if (offset !== undefined && text !== undefined) position = positionOf(text, offset.start);
    const where = position === undefined ? '' : ` at line ${position.line}, column ${position.column}`;
    super(`${code}: ${description}${where}`);
    this.name = 'XPathException';
    this.code = code;
    this.description = description;
    // A copy, as the span given may be a token or a syntax node with other fields.
    this.offset = offset === undefined ? undefined : { start: offset.start, end: offset.end };
    this.position = position;
    this.value = value;
  }
}

/** The line and column of an offset in a text, columns in characters, a CR LF pair or a lone CR or LF one line end. */
function positionOf(text: string, offset: number): TextPosition {
  const before = text.slice(0, offset);
  const lines = before.split(/\r\n?|\n/);
  return { line: lines.length, column: Array.from(lines.at(-1) as string).length + 1 };
}

/** Throws an XPathException for an error found in a span of an expression's text, without a stack trace. */
export function xpathError(code: string, message: string, at?: TextSpan, text?: string): never {
  throw ErrorFactory.create(XPathException, code, message, at, text);
}

/** Throws an XPathException for an error found while running an expression, without a stack trace. */
export function dynamicError(code: string, message: string): never {
  throw ErrorFactory.create(XPathException, code, message);
}
