import { describe, expect, it } from 'vitest';
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

describe('translateRegex', () => {
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

  it('reuses a translation for the same pattern, flags and dialect', () => {
    const first = translateRegex('cache-a', 'i', 'xpath');
    expect(translateRegex('cache-a', 'i', 'xpath')).toBe(first);
    expect(translateRegex('cache-a', '', 'xpath')).not.toBe(first);
    expect(translateRegex('cache-a', '', 'xsd')).not.toBe(translateRegex('cache-a', '', 'xpath'));
  });

  it('keeps a bounded number of translations, dropping the oldest', () => {
    const oldest = translateRegex('evicted', '', 'xpath');
    for (let i = 0; i < 600; i++) translateRegex(`filler${i}`, '', 'xpath');
    expect(translateRegex('evicted', '', 'xpath')).not.toBe(oldest);
  });
});
