import { describe, expect, it } from 'vitest';
import { errorCode, strings } from '../../helpers/evaluate.ts';

describe('matches', () => {
  it('finds a pattern anywhere, with flags', () => {
    expect(strings('string(matches("abracadabra", "bra")), string(matches("abracadabra", "^a.*a$"))')).toEqual([
      'true',
      'true',
    ]);
    expect(strings('string(matches("ABC", "abc", "i")), string(matches((), "^$"))')).toEqual(['true', 'true']);
  });

  it('raises FORX0001 for unknown flags and FORX0002 for a pattern that is not one', () => {
    expect(errorCode('matches("a", "a", "g")')).toBe('FORX0001');
    expect(errorCode('matches("a", "[")')).toBe('FORX0002');
  });

  it('refuses unknown flags at a call that has just translated the same text as flags and a pattern', () => {
    // Flags i with pattern x/y, then flags i/x with pattern y: the same characters, divided another way.
    const twice =
      "for $i in (1, 2) return matches('X/Y', if ($i = 1) then 'x/y' else 'y', if ($i = 1) then 'i' else 'i/x')";
    expect(errorCode(twice)).toBe('FORX0001');
  });
});

describe('replace', () => {
  it('replaces each match, filling in group references', () => {
    expect(strings('replace("abracadabra", "bra", "*"), replace("abracadabra", "a(.)", "a$1$1")')).toEqual([
      'a*cada*',
      'abbraccaddabbra',
    ]);
    expect(
      strings('replace("AAAA", "A+", "b"), replace("darted", "^(.*?)d(.*)$", "$1c$2"), replace((), "a", "b")')
    ).toEqual(['b', 'carted', '']);
  });

  it('reads $0 as the whole match, and a group that matched nothing as the empty string', () => {
    expect(strings('replace("abc", "b", "[$0]"), replace("ac", "a(x)?c", "[$1]")')).toEqual(['a[b]c', '[]']);
  });

  it('takes as many digits after $ as name a group, and the rest as text', () => {
    // With eleven groups $11 is group 11, but $12 is group 1 then the digit 2.
    expect(strings('replace("abcdefghijk", "(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)", "$11$12")')).toEqual(['ka2']);
    expect(strings('replace("ab", "(a)(b)", "$12")')).toEqual(['a2']);
  });

  it('reads escaped backslashes and dollars as themselves, and the whole replacement as text with the q flag', () => {
    expect(strings(String.raw`replace("a", "a", "\$\\"), replace("a", "a", "$1\", "q")`)).toEqual(['$\\', '$1\\']);
  });

  it('raises FORX0004 for a bad replacement and FORX0003 for a pattern matching the empty string', () => {
    expect(errorCode(String.raw`replace("a", "a", "\x")`)).toBe('FORX0004');
    expect(errorCode('replace("a", "a", "$")')).toBe('FORX0004');
    expect(errorCode('replace("a", "a", "$x")')).toBe('FORX0004');
    expect(errorCode('replace("a", "x*", "b")')).toBe('FORX0003');
  });
});

describe('tokenize', () => {
  it('splits on whitespace with one argument', () => {
    expect(strings('tokenize("  red  green blue "), tokenize(" ")')).toEqual(['red', 'green', 'blue']);
  });

  it('splits on a pattern, a separator at the start giving an empty first token', () => {
    expect(strings(String.raw`tokenize("The cat sat", "\s+")`)).toEqual(['The', 'cat', 'sat']);
    expect(strings('tokenize(",a,,b", ","), tokenize("ABC", "b", "i")')).toEqual(['', 'a', '', 'b', 'A', 'C']);
  });

  it('gives nothing for empty input, and FORX0003 for a pattern matching the empty string', () => {
    expect(strings('tokenize("", ","), tokenize((), ",")')).toEqual([]);
    expect(errorCode('tokenize("abc", "x?")')).toBe('FORX0003');
  });
});
