import { XPathErrorCode, xpathError } from '@/api/xpath-exception';
import { tokenize } from './lexer.ts';
import type { UnresolvedName } from './syntax-tree.ts';
import { type Token, TokenKind } from './tokens.ts';

/**
 * The tokens of an expression, read one at a time by the parser, with the lookahead XPath needs
 * to tell a keyword from a name.
 *
 * @example
 * const tokens = new TokenStream('for $a in 1 return $a');
 * tokens.atKeywordThen('for', '$'); // true: a for expression starts here
 */
export class TokenStream {
  readonly text: string;
  readonly #tokens: Token[];
  #index = 0;
  /** The offset just past the last token read. */
  #lastEnd = 0;

  constructor(text: string) {
    this.text = text;
    this.#tokens = tokenize(text);
  }

  /** The token at the current position, or the one `ahead` tokens after it; the end token past the end. */
  peek(ahead = 0): Token {
    const tokens = this.#tokens;
    return tokens[Math.min(this.#index + ahead, tokens.length - 1)] as Token;
  }

  /** Reads the current token and moves past it; past the end, `peek` keeps giving the end token. */
  next(): Token {
    const token = this.peek();
    this.#index++;
    this.#lastEnd = token.end;
    return token;
  }

  /** The offset of the current token's first character. */
  get start(): number {
    return this.peek().start;
  }

  /** The offset just past the last token read, where a part of the expression parsed so far ends. */
  get end(): number {
    return this.#lastEnd;
  }

  /** Whether every token has been read. */
  get atEnd(): boolean {
    return this.peek().kind === TokenKind.END;
  }

  /** Whether the token `ahead` of the current one is a symbol. */
  atSymbol(symbol: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token.kind === TokenKind.SYMBOL && token.text === symbol;
  }

  /** Whether the token `ahead` of the current one is a name without prefix or URI, as keywords are. */
  atKeyword(keyword: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token.kind === TokenKind.NAME && token.localName === keyword && isNcNameToken(token);
  }

  /** Whether the current token is a keyword and the one after it a symbol, as `if (` or `map {` are. */
  atKeywordThen(keyword: string, symbol: string): boolean {
    return this.atKeyword(keyword) && this.atSymbol(symbol, 1);
  }

  /** Reads a symbol when it is next, and says whether it was. */
  takeSymbol(symbol: string): boolean {
    if (!this.atSymbol(symbol)) return false;
    this.next();
    return true;
  }

  /** Reads a keyword when it is next, and says whether it was. */
  takeKeyword(keyword: string): boolean {
    if (!this.atKeyword(keyword)) return false;
    this.next();
    return true;
  }

  /** Reads a symbol that must come next. */
  expectSymbol(symbol: string): Token {
    if (!this.atSymbol(symbol)) this.fail(`Expected "${symbol}"`);
    return this.next();
  }

  /** Reads a keyword that must come next. */
  expectKeyword(keyword: string): Token {
    if (!this.atKeyword(keyword)) this.fail(`Expected "${keyword}"`);
    return this.next();
  }

  /** Reads a name, with any prefix or braced URI, that must come next. */
  expectName(what = 'a name'): UnresolvedName {
    const token = this.peek();
    if (token.kind !== TokenKind.NAME) this.fail(`Expected ${what}`);
    this.next();
    return nameOf(token);
  }

  /** Reads a name without prefix or URI that must come next, and returns it. */
  expectNcName(what: string): string {
    const token = this.peek();
    if (token.kind !== TokenKind.NAME || !isNcNameToken(token)) this.fail(`Expected ${what}`);
    this.next();
    return token.localName;
  }

  /** Reads the keyword that is next and the `(` that must follow it, as a kind test or inline function begins; gives where it starts. */
  takeOpening(): number {
    const start = this.start;
    this.next();
    this.expectSymbol('(');
    return start;
  }

  /** Reads items separated by commas until a closing symbol that must come, none when it comes first. */
  listUntil<Item>(close: string, parse: (tokens: this) => Item): Item[] {
    const items: Item[] = [];
    if (!this.atSymbol(close)) {
      do items.push(parse(this));
      while (this.takeSymbol(','));
    }
    this.expectSymbol(close);
    return items;
  }

  /** Raises XPST0003 at the current token, saying what was found there. */
  fail(message: string): never {
    const token = this.peek();
    const found = token.kind === TokenKind.END ? 'the end of the expression' : `"${token.text}"`;
    return xpathError(XPathErrorCode.SYNTAX_ERROR, `${message}, but found ${found}`, token, this.text);
  }
}

/** Whether a name token is a plain NCName, with neither a prefix nor a braced URI. */
export function isNcNameToken(token: Token): boolean {
  return token.prefix === '' && token.namespaceURI === undefined;
}

/** The name a name token holds. */
export function nameOf(token: Token): UnresolvedName {
  return {
    start: token.start,
    end: token.end,
    prefix: token.prefix,
    namespaceURI: token.namespaceURI,
    localName: token.localName,
  };
}
