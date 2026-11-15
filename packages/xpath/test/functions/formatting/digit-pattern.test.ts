import { describe, expect, it } from 'vitest';
import { formatDigits, hasDecimalDigit, parseDigitPattern } from '@/functions/formatting/digit-pattern';

const CODE = 'FODF1310';

/** The code a pattern raises, or undefined. */
function failure(token: string): string | undefined {
  try {
    parseDigitPattern(token, CODE);
    return undefined;
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe('decimal digit patterns', () => {
  it('are told apart by holding a digit', () => {
    expect([hasDecimalDigit('#0'), hasDecimalDigit('#'), hasDecimalDigit('\u0661')]).toEqual([true, false, true]);
  });

  it('count mandatory and optional digits', () => {
    const pattern = parseDigitPattern('##0,000', CODE);
    expect([pattern.mandatoryDigits, pattern.digitSigns, pattern.regularInterval]).toEqual([4, 6, 3]);
  });

  it('repeat regular separators and keep irregular ones where they are', () => {
    expect(formatDigits('1500000', parseDigitPattern('#,##0', CODE))).toBe('1,500,000');
    expect(formatDigits('15', parseDigitPattern("0'000", CODE))).toBe("0'015");
    expect(formatDigits('602347826', parseDigitPattern('#(000)000-000', CODE))).toBe('602)347-826');
    expect(formatDigits('123456789', parseDigitPattern('000,00,00', CODE))).toBe('12345,67,89');
    expect(formatDigits('123456789', parseDigitPattern('0,0,00,0', CODE))).toBe('12345,6,78,9');
    expect(formatDigits('123456789', parseDigitPattern('0,00,000', CODE))).toBe('1234,56,789');
    expect(formatDigits('123456', parseDigitPattern('0,00-000', CODE))).toBe('1,23-456');
  });

  it('pad to a minimum and write digits of the family', () => {
    expect(formatDigits('7', parseDigitPattern('0', CODE), 3)).toBe('007');
    expect(formatDigits('1234', parseDigitPattern('#,\u0660\u0660\u0660', CODE))).toBe('\u0661,\u0662\u0663\u0664');
  });

  it('reject letters, mixed families, late optional digits and misplaced separators', () => {
    expect(['1o', '1\u0661', '0#', ',000', '0,', '0,,0', '0'].map((token) => failure(token))).toEqual([
      CODE,
      CODE,
      CODE,
      CODE,
      CODE,
      CODE,
      undefined,
    ]);
  });
});
