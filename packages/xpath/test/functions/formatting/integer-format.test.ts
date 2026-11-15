import { describe, expect, it } from 'vitest';
import { formatInteger, inLetterCase, parsePrimaryToken } from '@/functions/formatting/integer-format';

/** An integer as a token writes it, as a cardinal. */
function write(value: bigint, token: string, ordinal = false): string {
  return formatInteger(value, parsePrimaryToken(token, 'FODF1310'), { ordinal });
}

describe('primary format tokens', () => {
  it('write letters, carrying to two letters after the last', () => {
    expect([1n, 26n, 27n, 52n, 703n].map((value) => write(value, 'a'))).toEqual(['a', 'z', 'aa', 'az', 'aaa']);
    expect(write(28n, 'A')).toBe('AB');
    expect(write(25n, '\u03B1')).toBe('\u03B1\u03B1');
    expect(write(24n, '\u0391')).toBe('\u03A9');
  });

  it('write roman numerals from 1 to 3999', () => {
    expect([1n, 4n, 9n, 14n, 40n, 90n, 400n, 1994n, 3999n].map((value) => write(value, 'I'))).toEqual([
      'I',
      'IV',
      'IX',
      'XIV',
      'XL',
      'XC',
      'CD',
      'MCMXCIV',
      'MMMCMXCIX',
    ]);
    expect(write(2024n, 'i')).toBe('mmxxiv');
  });

  it('fall back to digits for numbers a sequence cannot write', () => {
    expect([write(0n, 'a'), write(0n, 'i'), write(4000n, 'I'), write(10n ** 36n, 'w')]).toEqual([
      '0',
      '0',
      '4000',
      String(10n ** 36n),
    ]);
  });

  it('write words in three cases, cardinal or ordinal', () => {
    expect([write(21n, 'w'), write(21n, 'W'), write(21n, 'Ww'), write(21n, 'Ww', true)]).toEqual([
      'twenty-one',
      'TWENTY-ONE',
      'Twenty-One',
      'Twenty-First',
    ]);
  });

  it('put a minus sign before negative numbers', () => {
    expect([write(-5n, 'Ww', true), write(-85n, '1', true), write(-3n, 'I')]).toEqual(['-Fifth', '-85th', '-III']);
  });

  it('read any other token as 1', () => {
    expect([write(12n, 'b'), write(12n, '#'), write(12n, '\u2460', true)]).toEqual(['12', '12', '12th']);
  });

  it('capitalize words after spaces and hyphens in title case', () => {
    expect(inLetterCase('one hundred and twenty-one', 'title')).toBe('One Hundred And Twenty-One');
  });
});
