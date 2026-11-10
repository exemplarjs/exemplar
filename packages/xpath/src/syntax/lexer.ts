import {
  Char,
  collapseWhitespace,
  isAsciiDigit,
  isNameChar,
  isNameStartChar,
  isWhitespaceChar,
  SURROGATE_PAIR_LENGTH,
  Unicode,
} from '@exemplarjs/xml/internal';
import { XPathErrorCode, xpathError } from '@/api/xpath-exception';
import { type Token, TokenKind } from './tokens.ts';

/** The symbols of one character, by character code. */
const ONE_CHARACTER_SYMBOLS: readonly (string | undefined)[] = symbolTable('()[]{},$@./:=<>+-*|!?#');

/** The symbols of two characters by their first character's code, each a map from its second's; matched before single ones. */
const TWO_CHARACTER_SYMBOLS: readonly (ReadonlyMap<number, string> | undefined)[] = twoCharacterTable([
  '//',
  '::',
  ':=',
  '..',
  '!=',
  '<=',
  '<<',
  '>=',
  '>>',
  '=>',
  '||',
]);

/** A table of one-character symbols by character code. */
function symbolTable(symbols: string): (string | undefined)[] {
  const table: (string | undefined)[] = [];
  for (const symbol of symbols) table[symbol.codePointAt(0) as number] = symbol;
  return table;
}

/** A table of two-character symbols by their first character's code. */
function twoCharacterTable(symbols: readonly string[]): (Map<number, string> | undefined)[] {
  const table: (Map<number, string> | undefined)[] = [];
  for (const symbol of symbols) {
    const first = symbol.codePointAt(0) as number;
    const seconds = table[first] ?? new Map<number, string>();
    seconds.set(symbol.codePointAt(1) as number, symbol);
    table[first] = seconds;
  }
  return table;
}

// Module-level constants, so V8 can inline them.
const { COLON, LEFT_PAREN, NON_ASCII, RIGHT_PAREN } = Char;
const { SUPPLEMENTARY_FIRST } = Unicode;

/** The length of `*:` before a local name wildcard's name. */
const WILDCARD_PREFIX_LENGTH = '*:'.length;
/** The length of `:*` after a namespace wildcard's prefix. */
const WILDCARD_SUFFIX_LENGTH = ':*'.length;
/** The length of an exponent's `e` with its sign. */
const SIGNED_EXPONENT_LENGTH = 'e+'.length;
/** The length of a doubled delimiter, which a string literal holds for one. */
const DOUBLED_DELIMITER_LENGTH = '""'.length;
/** The length of a comment's `(:` and of its `:)`. */
const COMMENT_DELIMITER_LENGTH = '(:'.length;

/** 1 for each ASCII character a name without colons may hold after its first. */
const ASCII_NC_NAME_CHARS = Uint8Array.from({ length: NON_ASCII }, (_, code) => {
  const isNcNameChar = code !== COLON && isNameChar(code);
  return isNcNameChar ? 1 : 0;
});

/** The offset just past a name's characters from an offset, reading code points, for names with non-ASCII characters. */
function nonAsciiNameEnd(text: string, from: number): number {
  let offset = from;
  while (offset < text.length) {
    const codePoint = text.codePointAt(offset) as number;
    if (codePoint === COLON || !isNameChar(codePoint)) break;
    offset += codePoint >= SUPPLEMENTARY_FIRST ? SURROGATE_PAIR_LENGTH : 1;
  }
  return offset;
}

/** Whether the code point at an offset can start a name. */
function startsName(text: string, offset: number): boolean {
  const codePoint = text.codePointAt(offset);
  return codePoint !== undefined && codePoint !== COLON && isNameStartChar(codePoint);
}

/**
 * Splits an expression into tokens, dropping comments and whitespace. Keywords stay names and `*` a
 * symbol, as only the parser knows which is a keyword and which `*` a wildcard.
 *
 * @example
 * tokenize('//dc:title[. != "x"]'); // '//', the name dc:title, '[', '.', '!=', the string x, ']', end
 */
class Lexer {
  readonly #text: string;
  readonly #tokens: Token[] = [];
  #offset = 0;

  constructor(text: string) {
    this.#text = text;
  }

  /** Every token of the text, ending with an end token. */
  tokenize(): Token[] {
    for (this.#skipSpace(); this.#offset < this.#text.length; this.#skipSpace()) this.#readToken();
    this.#push(TokenKind.END, '', this.#offset);
    return this.#tokens;
  }

  /** Reads the token at the current offset. */
  #readToken(): void {
    const text = this.#text;
    const start = this.#offset;
    const character = text[start] as string;
    if (isAsciiDigit(character) || (character === '.' && isAsciiDigit(text[start + 1]))) this.#readNumber();
    else if (character === '"' || character === "'") this.#readString(character);
    else if (startsName(text, start)) this.#readName();
    else if (character === '*' && text[start + 1] === ':' && startsName(text, start + WILDCARD_PREFIX_LENGTH))
      this.#readLocalNameWildcard();
    else this.#readSymbol();
  }

  /** Skips whitespace and comments. */
  #skipSpace(): void {
    const text = this.#text;
    for (;;) {
      // eslint-disable-next-line prefer-code-point -- spaces and line ends are single code units
      const code = text.charCodeAt(this.#offset);
      if (isWhitespaceChar(code, false)) this.#offset++;
      else if (code === LEFT_PAREN && text.charCodeAt(this.#offset + 1) === COLON) this.#skipComment();
      else return;
    }
  }

  /** Skips a comment, `(: ... :)`, with any comments nested in it. */
  #skipComment(): void {
    const text = this.#text;
    const start = this.#offset;
    let offset = start;
    let depth = 0;
    do {
      if (offset >= text.length) this.#failToEnd('A comment is not closed with ":)"', start);
      const code = text.charCodeAt(offset);
      const next = text.charCodeAt(offset + 1);
      if (code === LEFT_PAREN && next === COLON) {
        depth++;
        offset += COMMENT_DELIMITER_LENGTH;
      } else if (code === COLON && next === RIGHT_PAREN) {
        depth--;
        offset += COMMENT_DELIMITER_LENGTH;
      } else offset++;
    } while (depth > 0);
    this.#offset = offset;
  }

  /** Reads an integer, decimal or double literal, such as `12`, `1.5`, `.5` or `1e3`. */
  #readNumber(): void {
    const start = this.#offset;
    let kind: TokenKind = TokenKind.INTEGER;
    this.#skipDigits();
    if (this.#text[this.#offset] === '.') {
      kind = TokenKind.DECIMAL;
      this.#offset++;
      this.#skipDigits();
    }
    const exponentLength = this.#exponentLength();
    if (exponentLength > 0) {
      kind = TokenKind.DOUBLE;
      this.#offset += exponentLength;
      this.#skipDigits();
    }
    // A number must be set apart from a name or another dot that follows it, as `10div 3` is not.
    if (this.#text[this.#offset] === '.' || startsName(this.#text, this.#offset))
      this.#failAtCharacter('A number must be followed by a space or a symbol', this.#offset);
    this.#push(kind, this.#text.slice(start, this.#offset), start);
  }

  /** The length of an exponent's `e` or `E` and optional sign at the offset, or 0 unless a digit follows them. */
  #exponentLength(): number {
    const text = this.#text;
    const offset = this.#offset;
    if (text[offset] !== 'e' && text[offset] !== 'E') return 0;
    const signed = text[offset + 1] === '+' || text[offset + 1] === '-';
    const length = signed ? SIGNED_EXPONENT_LENGTH : 1;
    return isAsciiDigit(text[offset + length]) ? length : 0;
  }

  /** Skips a run of digits. */
  #skipDigits(): void {
    while (isAsciiDigit(this.#text[this.#offset])) this.#offset++;
  }

  /** Reads a string literal, where a doubled delimiter stands for one, as in `'it''s'`. */
  #readString(delimiter: string): void {
    const text = this.#text;
    const start = this.#offset;
    let value = '';
    let from = start + 1;
    for (;;) {
      const close = text.indexOf(delimiter, from);
      if (close === -1) this.#failToEnd('A string is not closed', start);
      value += text.slice(from, close);
      if (text[close + 1] !== delimiter) {
        this.#offset = close + 1;
        break;
      }
      value += delimiter;
      from = close + DOUBLED_DELIMITER_LENGTH;
    }
    this.#push(TokenKind.STRING, value, start);
  }

  /** Reads a name, `prefix:local`, `Q{uri}local`, or a namespace wildcard, `prefix:*` or `Q{uri}*`. */
  #readName(): void {
    const start = this.#offset;
    const first = this.#scanNcName();
    const text = this.#text;
    if (first === 'Q' && text[this.#offset] === '{') return this.#readBracedName(start);
    if (text[this.#offset] === ':' && startsName(text, this.#offset + 1)) {
      this.#offset++;
      const localName = this.#scanNcName();
      return this.#pushName(TokenKind.NAME, start, first, undefined, localName);
    }
    if (text[this.#offset] === ':' && text[this.#offset + 1] === '*') {
      this.#offset += WILDCARD_SUFFIX_LENGTH;
      return this.#pushName(TokenKind.NAMESPACE_WILDCARD, start, first, undefined, '');
    }
    return this.#pushName(TokenKind.NAME, start, '', undefined, first);
  }

  /** Reads `Q{uri}local` or `Q{uri}*`, after the `Q`; the URI's whitespace is collapsed, as for `xs:anyURI`. */
  #readBracedName(start: number): void {
    const text = this.#text;
    const close = text.indexOf('}', this.#offset);
    const open = text.indexOf('{', this.#offset + 1);
    if (close === -1 || (open !== -1 && open < close)) this.#failToEnd('A braced URI is not closed with "}"', start);
    const namespaceURI = collapseWhitespace(text.slice(this.#offset + 1, close));
    this.#offset = close + 1;
    if (text[this.#offset] === '*') {
      this.#offset++;
      return this.#pushName(TokenKind.NAMESPACE_WILDCARD, start, '', namespaceURI, '');
    }
    if (!startsName(text, this.#offset))
      this.#failAtCharacter('Expected a local name or "*" after a braced URI', this.#offset);
    this.#pushName(TokenKind.NAME, start, '', namespaceURI, this.#scanNcName());
  }

  /** Reads `*:local`. */
  #readLocalNameWildcard(): void {
    const start = this.#offset;
    this.#offset += WILDCARD_PREFIX_LENGTH;
    this.#pushName(TokenKind.LOCAL_NAME_WILDCARD, start, '', undefined, this.#scanNcName());
  }

  /** Scans a name without colons from the offset, which starts one, and returns it. */
  #scanNcName(): string {
    const text = this.#text;
    const start = this.#offset;
    let offset = start;
    const length = text.length;
    // eslint-disable-next-line prefer-code-point -- ASCII first; other characters take the code point path
    while (offset < length && ASCII_NC_NAME_CHARS[text.charCodeAt(offset)] === 1) offset++;
    // eslint-disable-next-line prefer-code-point -- as above
    if (offset < length && text.charCodeAt(offset) >= NON_ASCII) offset = nonAsciiNameEnd(text, offset);
    this.#offset = offset;
    return text.slice(start, offset);
  }

  /** Reads a symbol, the longest that matches. */
  #readSymbol(): void {
    const text = this.#text;
    const start = this.#offset;
    // eslint-disable-next-line prefer-code-point -- symbols are ASCII; anything else is an error
    const first = text.charCodeAt(start);
    // eslint-disable-next-line prefer-code-point -- as above
    const symbol = TWO_CHARACTER_SYMBOLS[first]?.get(text.charCodeAt(start + 1)) ?? ONE_CHARACTER_SYMBOLS[first];
    if (symbol === undefined) this.#unexpectedCharacter(start);
    this.#offset += symbol.length;
    this.#push(TokenKind.SYMBOL, symbol, start);
  }

  /** Raises XPST0003 for a character that starts no token. */
  #unexpectedCharacter(offset: number): never {
    return this.#failAtCharacter(
      `Unexpected character "${String.fromCodePoint(this.#text.codePointAt(offset) as number)}"`,
      offset
    );
  }

  /** Adds a token that is not a name, ending at the offset. */
  #push(kind: TokenKind, text: string, start: number): void {
    this.#tokens.push({ kind, text, start, end: this.#offset, prefix: '', namespaceURI: undefined, localName: '' });
  }

  /** Adds a name or wildcard token, ending at the offset. */
  #pushName(kind: TokenKind, start: number, prefix: string, namespaceURI: string | undefined, localName: string): void {
    const end = this.#offset;
    // A plain name is its own text, so it needs no second slice.
    const text = end - start === localName.length ? localName : this.#text.slice(start, end);
    this.#tokens.push({ kind, text, start, end, prefix, namespaceURI, localName });
  }

  /** Raises XPST0003 for an error in the character at an offset, or at the end of the text. */
  #failAtCharacter(message: string, offset: number): never {
    const codePoint = this.#text.codePointAt(offset);
    const length = codePoint === undefined ? 0 : String.fromCodePoint(codePoint).length;
    return xpathError(XPathErrorCode.SYNTAX_ERROR, message, { start: offset, end: offset + length }, this.#text);
  }

  /** Raises XPST0003 for something unclosed, from an offset to the end of the text. */
  #failToEnd(message: string, start: number): never {
    return xpathError(XPathErrorCode.SYNTAX_ERROR, message, { start, end: this.#text.length }, this.#text);
  }
}

/** Splits an XPath expression into tokens, ending with an end token; raises XPST0003 for text that is not XPath. */
export function tokenize(text: string): Token[] {
  return new Lexer(text).tokenize();
}
