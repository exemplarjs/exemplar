import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, LIBRARY, strings } from '../../helpers/evaluate.ts';

const COLLATION = '"http://www.w3.org/2005/xpath-functions/collation/codepoint"';

describe('string functions', () => {
  it('give string values, of an argument or the context item', () => {
    expect(strings('string(1.5), string(()), string(//book[1]/@id)', LIBRARY)).toEqual(['1.5', '', 'b1']);
    expect(strings('//book[1]/@id/string()', LIBRARY)).toEqual(['b1']);
    expect(strings('string-length("a\u{10000}b"), string-length(())')).toEqual(['3', '0']);
    expect(strings('//book[1]/@id/string-length()', LIBRARY)).toEqual(['2']);
    expect(errorCode('string(abs#1)')).toBe('FOTY0014');
    expect(errorCode('string([1])')).toBe('FOTY0014');
  });

  it('normalize space, collapsing XML whitespace only', () => {
    expect(strings('normalize-space("  a \t b\n "), normalize-space(())')).toEqual(['a b', '']);
    expect(strings('string-to-codepoints(normalize-space(codepoints-to-string((160, 32, 97))))')).toEqual([
      '160',
      '32',
      '97',
    ]);
    expect(strings('(//text())[last()]/normalize-space()', LIBRARY)).toEqual(['text']);
  });

  it('join strings', () => {
    expect(strings('concat("a", (), 1), string-join(("a", "b")), string-join((1, 2), "-")')).toEqual([
      'a1',
      'ab',
      '1-2',
    ]);
  });

  it('take substrings by code point, rounding start and length', () => {
    expect(
      strings('substring("12345", 1.5, 2.6), substring("12345", 0, 3), substring("12345", -42, 1 div 0e0)')
    ).toEqual(['234', '12', '12345']);
    expect(
      strings(
        'substring("a\u{10000}b", 2, 1), substring("abc", xs:double("NaN")), substring("abc", 1, xs:double("NaN"))'
      )
    ).toEqual(['\u{10000}', '', '']);
    expect(strings('substring("abc", 3, -1)')).toEqual(['']);
    expect(strings('substring("abc", -1 div 0e0)')).toEqual(['abc']);
  });

  it('search within strings, with or without the codepoint collation', () => {
    expect(
      strings(
        `contains("abc", "b"), starts-with("abc", "a"), ends-with("abc", "c"), contains("abc", "x", ${COLLATION})`
      )
    ).toEqual(['true', 'true', 'true', 'false']);
    expect(
      strings(
        'substring-before("a=b", "="), substring-after("a=b", "="), substring-before("ab", "x"), substring-after("ab", "x")'
      )
    ).toEqual(['a', 'b', '', '']);
  });

  it('resolve a relative collation URI against the static base URI, and reject collations it does not have', () => {
    expect(
      strings('contains("abc", "b", "collation/codepoint")', null, {
        baseURI: 'http://www.w3.org/2005/xpath-functions/',
      })
    ).toEqual(['true']);
    expect(errorCode('contains("abc", "b", "urn:other")')).toBe('FOCH0002');
    expect(errorCode('contains("abc", "b", "::")', null, { baseURI: 'not a base' })).toBe('FOCH0002');
  });

  it('change case character by character', () => {
    expect(strings('upper-case("abß"), lower-case("ÀB")')).toEqual(['ABSS', 'àb']);
    expect(strings('string-to-codepoints(lower-case("ΑΣ"))')).toEqual(['945', '963']);
  });

  it('translate characters, removing those with no counterpart', () => {
    expect(strings('translate("bar", "abc", "ABC"), translate("--aaa--", "abc-", "ABC")')).toEqual(['BAr', 'AAA']);
  });

  it('convert between strings and code points', () => {
    expect(strings('codepoints-to-string((72, 105, 65536)), string-to-codepoints("Hi")')).toEqual([
      'Hi\u{10000}',
      '72',
      '105',
    ]);
    expect(errorCode('codepoints-to-string(0)')).toBe('FOCH0001');
    expect(errorCode('codepoints-to-string(55296)')).toBe('FOCH0001');
    expect(strings('string-length(codepoints-to-string((9, 10, 13, 57344)))')).toEqual(['4']);
  });

  it('compare strings by code point', () => {
    expect(strings(`compare("a", "b"), compare("b", "a"), compare("a", "a", ${COLLATION})`)).toEqual(['-1', '1', '0']);
    expect(evaluate('compare((), "a"), codepoint-equal("a", ())')).toEqual([]);
    expect(strings('codepoint-equal("a", "a")')).toEqual(['true']);
  });

  it('find tokens separated by whitespace', () => {
    expect(
      strings(
        `contains-token("a b", " b "), contains-token(("x", "a  b"), "a"), contains-token("a", ""), contains-token("ab", "a", ${COLLATION})`
      )
    ).toEqual(['true', 'true', 'false', 'false']);
  });

  it('normalize Unicode', () => {
    expect(
      strings(
        'string-length(normalize-unicode("é")), string-length(normalize-unicode("é", " nfd ")), normalize-unicode("x", "")'
      )
    ).toEqual(['1', '2', 'x']);
    expect(errorCode('normalize-unicode("x", "FULLY-NORMALIZED")')).toBe('FOCH0003');
  });

  it('percent-encode for URIs', () => {
    expect(
      strings('encode-for-uri("a b/ç~"), iri-to-uri("http://e.com/a b<ç>"), escape-html-uri("http://e.com/a b ç")')
    ).toEqual(['a%20b%2F%C3%A7~', 'http://e.com/a%20b%3C%C3%A7%3E', 'http://e.com/a b %C3%A7']);
  });

  it('find, compare and match tokens by the collation given', () => {
    const html = '"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"';
    const primary = '"http://www.w3.org/2013/collation/UCA?strength=primary"';
    expect(
      strings(`string(contains("HELLO", "ell", ${html})), string(starts-with("Résumé", "RES", ${primary}))`)
    ).toEqual(['true', 'true']);
    expect(strings(`string(ends-with("abc", "BC", ${html})), string(compare("a", "A", ${primary}))`)).toEqual([
      'true',
      '0',
    ]);
    expect(strings(`substring-before("aXbXc", "x", ${html}), substring-after("aXbXc", "x", ${html})`)).toEqual([
      'a',
      'bXc',
    ]);
    expect(
      strings(`string(contains-token("red GREEN", "green", ${html})), string(contains-token("red", "green", ${html}))`)
    ).toEqual(['true', 'false']);
  });
});
