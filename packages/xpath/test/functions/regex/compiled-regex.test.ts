import { describe, expect, it } from 'vitest';
import { compiledRegex, nonEmptyRegex, segments } from '@/functions/regex/compiled-regex';
import { XPathException } from '@/index';

/** The code of the XPathException a call raises. */
function codeOf(call: () => unknown): string | undefined {
  try {
    call();
    return undefined;
  } catch (error) {
    return error instanceof XPathException ? error.code : 'not an XPathException';
  }
}

describe('compiled regular expressions', () => {
  it('translates a pattern with its flags', () => {
    expect(compiledRegex('a.c', 's').regex.test('a\nc')).toBe(true);
  });

  it('turns translation errors into FORX0001 and FORX0002', () => {
    expect(codeOf(() => compiledRegex('a', 'z'))).toBe('FORX0001');
    expect(codeOf(() => compiledRegex('a{2,1}', ''))).toBe('FORX0002');
  });

  it('raises FORX0003 for a pattern that matches the empty string where one must not', () => {
    expect(codeOf(() => nonEmptyRegex('^', ''))).toBe('FORX0003');
    expect(nonEmptyRegex('a', '').groupCount).toBe(0);
  });

  it('divides a text into segments, each match with its groups, leaving the shared expressions untouched', () => {
    const translated = compiledRegex('(a)(b)?', '');
    const parts = [...segments(translated, 'abxa'), ...segments(translated, 'xx')];
    expect(parts.map(({ from, match }) => [from, match?.index, match?.[0], match?.indices?.[2]])).toEqual([
      [0, 0, 'ab', [1, 2]],
      [2, 3, 'a', undefined],
      [4, undefined, undefined, undefined],
      [0, undefined, undefined, undefined],
    ]);
    expect([translated.regex.lastIndex, translated.global.lastIndex]).toEqual([0, 0]);
  });
});
