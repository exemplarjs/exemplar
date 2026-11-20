import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateRegex } from '@/util/regex';
import { RegexError } from '@/util/regex-error';

/** The error a translation throws. */
function failure(pattern: string, flags: string, dialect: 'xpath' | 'xsd'): RegexError {
  try {
    translateRegex(pattern, flags, dialect);
  } catch (error) {
    if (error instanceof RegexError) return error;
    throw error;
  }
  throw new Error(`"${pattern}" translated`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('translateRegex', () => {
  it('gives a pattern the engine refuses as an invalid pattern, and other failures unchanged', () => {
    /** An engine with a limit the translation does not know, as some have on quantifiers. */
    const refusing = (error: Error) =>
      vi.stubGlobal(
        'RegExp',
        class {
          constructor() {
            throw error;
          }
        }
      );
    refusing(new SyntaxError('number too large in {} quantifier'));
    const refused = failure('a{99999999999999999999}', '', 'xpath');
    expect([refused.kind, refused.index, refused.message]).toEqual([
      'invalid-pattern',
      undefined,
      'Invalid regular expression "a{99999999999999999999}": the JavaScript engine does not accept it (number too large in {} quantifier)',
    ]);
    refusing(new RangeError('out of memory'));
    expect(() => translateRegex('a{88888888888888888888}', '', 'xpath')).toThrow(RangeError);
  });

  it('translates XPath patterns, which match anywhere', () => {
    const { regex, groupCount, groupParents } = translateRegex('(a)(?:b)(c)', '', 'xpath');
    expect([regex.flags, groupCount, regex.test('xabcx')]).toEqual(['v', 2, true]);
    expect(groupParents).toEqual([0, 0, 0]);
    expect(translateRegex('[a-z-[aeiou]]+', 'i', 'xpath').regex.test('XYZ')).toBe(true);
  });

  it('translates XSD patterns, which match the whole string', () => {
    expect(translateRegex(String.raw`\d{3}`, '', 'xsd').regex.test('123')).toBe(true);
    expect(translateRegex(String.raw`\d{3}`, '', 'xsd').regex.test('1234')).toBe(false);
  });

  it.each([
    ['s', 'a.b', 'a\nb', true],
    ['m', '^b', 'a\nb', true],
    ['i', 'AB', 'xaby', true],
    ['x', 'a b', 'ab', true],
    ['q', 'a.b', 'axb', false],
    ['qs', '.', '\n', false],
    ['qm', '^a', 'x\na', false],
    ['qx', 'a b', 'ab', false],
    ['qi', 'A.', 'xa.', true],
    ['smix', '^ A . $', 'x\na\n\n', true],
    ['ii', 'A', 'a', true],
  ])('takes the flags %j: %j matches %j: %s', (flags, pattern, input, expected) => {
    expect(translateRegex(pattern, flags, 'xpath').regex.test(input)).toBe(expected);
  });

  it('rejects flags XPath does not have, and any flags in XSD', () => {
    const unknown = failure('a', 'ig', 'xpath');
    expect([unknown.kind, unknown.reason, unknown.pattern, unknown.index]).toEqual([
      'invalid-flags',
      '"g" is not one of the flags s, m, i, x and q',
      'ig',
      undefined,
    ]);
    expect(failure('a', 'I', 'xpath').kind).toBe('invalid-flags');
    expect(failure('a', 'i', 'xsd').reason).toBe('XML Schema patterns take no flags');
  });

  it('checks the flags before the pattern', () => {
    expect(failure('(', 'z', 'xpath').kind).toBe('invalid-flags');
    expect(failure('(', '', 'xpath').kind).toBe('invalid-pattern');
  });

  it('translates a pattern each time it is asked, keeping nothing', () => {
    const first = translateRegex('given-twice', 'i', 'xpath');
    const second = translateRegex('given-twice', 'i', 'xpath');
    expect(second).not.toBe(first);
    expect(second.regex.source).toBe(first.regex.source);
  });
});
