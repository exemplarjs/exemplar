import { describe, expect, it } from 'vitest';
import { XPathException } from '@/index';
import { tokenize } from '@/syntax/lexer';
import { TokenKind } from '@/syntax/tokens';

/** Each token's kind and text, without the end token. */
function kindsAndTexts(text: string): string[] {
  return tokenize(text)
    .slice(0, -1)
    .map((token) => `${token.kind} ${token.text}`);
}

/** The message of the error tokenizing raises. */
function errorOf(text: string): XPathException {
  try {
    tokenize(text);
  } catch (error) {
    return error as XPathException;
  }
  throw new Error(`${text} tokenized`);
}

describe('tokenize', () => {
  it('ends with an end token at the end of the text', () => {
    const tokens = tokenize('a ');
    expect(tokens.at(-1)).toMatchObject({ kind: TokenKind.END, start: 2, end: 2 });
  });

  it('reads the symbols, two-character ones first', () => {
    const symbols = '// :: := .. != <= << >= >> => || ( ) [ ] { } , $ @ . / : = < > + - * | ! ? #';
    expect(kindsAndTexts(symbols)).toEqual(symbols.split(' ').map((symbol) => `symbol ${symbol}`));
    expect(kindsAndTexts('a!=b')).toEqual(['name a', 'symbol !=', 'name b']);
  });

  it('reads integers, decimals and doubles', () => {
    expect(kindsAndTexts('12 1.5 .5 5. 1e3 1.5E-3 .5e+2')).toEqual([
      'integer 12',
      'decimal 1.5',
      'decimal .5',
      'decimal 5.',
      'double 1e3',
      'double 1.5E-3',
      'double .5e+2',
    ]);
  });

  it('rejects a number followed by a name or a dot', () => {
    expect(errorOf('10div 3').message).toBe(
      'XPST0003: A number must be followed by a space or a symbol at line 1, column 3'
    );
    expect(errorOf('1e').code).toBe('XPST0003');
    expect(errorOf('1.2.3').code).toBe('XPST0003');
  });

  it('reads strings, where a doubled delimiter stands for one', () => {
    expect(tokenize(`"a""b" 'it''s' "it's"`).map((token) => token.text)).toEqual(['a"b', "it's", "it's", '']);
    expect(errorOf('"open').message).toBe('XPST0003: A string is not closed at line 1, column 1');
  });

  it('reads names with their prefixes and braced URIs', () => {
    const [plain, prefixed, braced] = tokenize('title dc:title Q{ http://e.com/ a }title');
    expect(plain).toMatchObject({ kind: TokenKind.NAME, prefix: '', namespaceURI: undefined, localName: 'title' });
    expect(prefixed).toMatchObject({ kind: TokenKind.NAME, prefix: 'dc', localName: 'title', text: 'dc:title' });
    expect(braced).toMatchObject({
      kind: TokenKind.NAME,
      prefix: '',
      namespaceURI: 'http://e.com/ a',
      localName: 'title',
    });
  });

  it('keeps hyphens and dots in names, as `a-b` and `a.b` are names', () => {
    expect(kindsAndTexts('a-b - c a.b $a-1')).toEqual([
      'name a-b',
      'symbol -',
      'name c',
      'name a.b',
      'symbol $',
      'name a-1',
    ]);
  });

  it('reads names beyond the BMP', () => {
    expect(tokenize('\u{10000}x')[0]).toMatchObject({ localName: '\u{10000}x', end: 3 });
  });

  it('reads wildcards as single tokens', () => {
    const [namespace, braced, local, star] = tokenize('dc:* Q{u}* *:title *');
    expect(namespace).toMatchObject({ kind: TokenKind.NAMESPACE_WILDCARD, prefix: 'dc' });
    expect(braced).toMatchObject({ kind: TokenKind.NAMESPACE_WILDCARD, namespaceURI: 'u' });
    expect(local).toMatchObject({ kind: TokenKind.LOCAL_NAME_WILDCARD, localName: 'title' });
    expect(star).toMatchObject({ kind: TokenKind.SYMBOL, text: '*' });
  });

  it('splits a colon that does not join a prefix to a name', () => {
    expect(kindsAndTexts('a :b a: b a::b *: b')).toEqual([
      'name a',
      'symbol :',
      'name b',
      'name a',
      'symbol :',
      'name b',
      'name a',
      'symbol ::',
      'name b',
      'symbol *',
      'symbol :',
      'name b',
    ]);
  });

  it('rejects a braced URI that is not closed or is not followed by a name', () => {
    expect(errorOf('Q{a').code).toBe('XPST0003');
    expect(errorOf('Q{a{b}c').code).toBe('XPST0003');
    expect(errorOf('Q{a} b').message).toBe(
      'XPST0003: Expected a local name or "*" after a braced URI at line 1, column 5'
    );
  });

  it('skips whitespace and comments, nested ones too', () => {
    expect(kindsAndTexts(' \t\r\n(: one (: two :) :)a(::)b')).toEqual(['name a', 'name b']);
    expect(errorOf('a (: (: :)').message).toBe('XPST0003: A comment is not closed with ":)" at line 1, column 3');
  });

  it('rejects characters that start no token', () => {
    expect(errorOf('a ; b').message).toBe('XPST0003: Unexpected character ";" at line 1, column 3');
    expect(errorOf('\u{F0000}').message).toBe('XPST0003: Unexpected character "\u{F0000}" at line 1, column 1');
  });

  it('records where each token starts and ends', () => {
    expect(tokenize('ab + "c"').map((token) => [token.start, token.end])).toEqual([
      [0, 2],
      [3, 4],
      [5, 8],
      [8, 8],
    ]);
  });
});
