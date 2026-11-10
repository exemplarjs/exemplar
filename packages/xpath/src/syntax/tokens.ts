/** The kinds of token an XPath expression is made of. */
export const TokenKind = {
  /** A name, such as `title`, `dc:title` or `Q{http://example.com}title`; keywords are names too. */
  NAME: 'name',
  /** A name test of any local name in one namespace: `dc:*` or `Q{http://example.com}*`. */
  NAMESPACE_WILDCARD: 'namespace-wildcard',
  /** A name test of one local name in any namespace: `*:title`. */
  LOCAL_NAME_WILDCARD: 'local-name-wildcard',
  INTEGER: 'integer',
  DECIMAL: 'decimal',
  DOUBLE: 'double',
  STRING: 'string',
  /** An operator or punctuation, such as `(`, `//` or `!=`. */
  SYMBOL: 'symbol',
  /** The end of the expression. */
  END: 'end',
} as const;

export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

/** One token of an expression, with where it sits in the text. */
export interface Token {
  readonly kind: TokenKind;
  /** The symbol, a number as written, a string literal's value, or a name as written. */
  readonly text: string;
  /** The offset of the token's first character. */
  readonly start: number;
  /** The offset just past the token's last character. */
  readonly end: number;
  /** A name's or namespace wildcard's prefix; `''` for none. */
  readonly prefix: string;
  /** The namespace URI a name or namespace wildcard gives in braces, as in `Q{http://example.com}title`. */
  readonly namespaceURI: string | undefined;
  /** A name's or local-name wildcard's local name. */
  readonly localName: string;
}
