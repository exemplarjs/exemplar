import { describe, expect, it } from 'vitest';
import { floatToString } from '@/index';
import { fractionToFloat, parseFloat32 } from '@/numeric/float';

describe('parseFloat32', () => {
  it('reads floats, rounded to single precision', () => {
    expect(parseFloat32('0.1')).toBe(Math.fround(0.1));
    expect(parseFloat32('x')).toBeUndefined();
  });
});

describe('fractionToFloat', () => {
  it('rounds fractions half to even, to subnormals and to infinity', () => {
    expect([fractionToFloat(1n, 3n), fractionToFloat(-1n, 3n), fractionToFloat(0n, 7n)]).toEqual([
      Math.fround(1 / 3),
      Math.fround(-1 / 3),
      0,
    ]);
    // Exactly halfway between 2^24 and 2^24 + 2 rounds to the even significand, 2^24.
    expect(fractionToFloat(2n ** 24n + 1n, 1n)).toBe(2 ** 24);
    expect(fractionToFloat(2n ** 24n + 3n, 1n)).toBe(2 ** 24 + 4);
    expect(fractionToFloat(1n, 2n ** 149n)).toBe(2 ** -149);
    expect(fractionToFloat(1n, 2n ** 151n)).toBe(0);
    expect(fractionToFloat(2n ** 128n, 1n)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('floatToString', () => {
  it('writes only the digits a float needs', () => {
    expect([0.1, 1 / 3, 1e7, 16_777_216].map((value) => floatToString(Math.fround(value)))).toEqual([
      '0.1',
      '0.33333334',
      '1.0E7',
      '1.6777216E7',
    ]);
    expect([Math.fround(Number.NaN), -0].map((value) => floatToString(value))).toEqual(['NaN', '-0']);
    // A float that needs all nine significant digits to read back.
    expect(floatToString(Math.fround(1.18847975e-36))).toBe('1.18847975E-36');
  });

  it('finds the shortest form at powers of two, where the interval below is narrower', () => {
    expect([2 ** -96, 2 ** 87, 2 ** 90].map((value) => floatToString(Math.fround(value)))).toEqual([
      '1.2621775E-29',
      '1.5474251E26',
      '1.2379401E27',
    ]);
  });

  it('writes in scientific form a float below one millionth, even when its digits read 0.000001', () => {
    expect(floatToString(Math.fround(0.000001))).toBe('1.0E-6');
    expect(floatToString(Math.fround(0.0000011))).toBe('0.0000011');
  });
});
