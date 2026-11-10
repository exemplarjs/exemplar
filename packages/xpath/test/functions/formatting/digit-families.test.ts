import { describe, expect, it } from 'vitest';
import { familyZero, inFamily, isDecimalDigit } from '@/functions/formatting/digit-families';

describe('digit families', () => {
  it('know decimal digits of any script', () => {
    expect([isDecimalDigit('7'), isDecimalDigit('\u0663'), isDecimalDigit('a'), isDecimalDigit('\u2460')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('find the zero of a digit, also in runs of families side by side', () => {
    expect(familyZero('0')).toBe(0x30);
    expect(familyZero('9')).toBe(0x30);
    expect(familyZero('\u0663')).toBe(0x6_60);
    // Mathematical bold digits are followed directly by double-struck ones.
    expect(familyZero(String.fromCodePoint(0x1_d7_d9))).toBe(0x1_d7_d8);
    expect(familyZero(String.fromCodePoint(0x1_d7_e3))).toBe(0x1_d7_e2);
  });

  it('rewrite ASCII digits in a family and leave other characters', () => {
    expect(inFamily('12:30', 0x6_60)).toBe('\u0661\u0662:\u0663\u0660');
    expect(inFamily('12', 0x30)).toBe('12');
    expect(inFamily('19', 0x1_04_a0)).toBe(String.fromCodePoint(0x1_04_a1, 0x1_04_a9));
  });
});
