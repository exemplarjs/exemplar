import { describe, expect, it } from 'vitest';
import { doubleToString } from '@/index';
import { doubleToFraction, parseDouble } from '@/numeric/double';

describe('parseDouble', () => {
  it('reads the lexical forms of xs:double', () => {
    expect(['1', '-1.5', '.5e1', '1E-3', '+2.', 'INF', '+INF', '-INF'].map((text) => parseDouble(text))).toEqual([
      1,
      -1.5,
      5,
      0.001,
      2,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]);
    expect(parseDouble('NaN')).toBeNaN();
  });

  it('refuses what JavaScript accepts but XML Schema does not', () => {
    expect(['', 'Infinity', '0x10', '1e', 'inf', '1_000', '.'].map((text) => parseDouble(text))).toEqual(
      Array.from({ length: 7 }, () => undefined)
    );
  });
});

describe('doubleToString', () => {
  it('writes values from one millionth up to a million in plain decimal notation', () => {
    expect([1, 0.5, 100, 123_456.5, 0.000001, 999_999.9, -2.25].map((value) => doubleToString(value))).toEqual([
      '1',
      '0.5',
      '100',
      '123456.5',
      '0.000001',
      '999999.9',
      '-2.25',
    ]);
  });

  it('writes other values in scientific notation with at least one digit after the point', () => {
    expect([1e6, 1.5e-7, -2.5e20, 1.2345678e100].map((value) => doubleToString(value))).toEqual([
      '1.0E6',
      '1.5E-7',
      '-2.5E20',
      '1.2345678E100',
    ]);
  });

  it('writes the special values as XPath does', () => {
    const special = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0];
    expect(special.map((value) => doubleToString(value))).toEqual(['NaN', 'INF', '-INF', '0', '-0']);
  });
});

describe('doubleToFraction', () => {
  it('gives the exact binary fraction of normal, large, negative and subnormal doubles', () => {
    expect(doubleToFraction(0.5)).toEqual([1n << 52n, 1n << 53n]);
    expect(doubleToFraction(-3)).toEqual([-(3n << 51n), 1n << 51n]);
    expect(doubleToFraction(2 ** 80)).toEqual([2n ** 80n, 1n]);
    expect(doubleToFraction(2 ** -1074)).toEqual([1n, 2n ** 1074n]);
    expect(doubleToFraction(0)).toEqual([0n, 2n ** 1074n]);
  });
});
