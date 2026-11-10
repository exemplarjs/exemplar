import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { Decimal, InvalidArgumentError, type RoundingMode } from '@/index';

/** A decimal from text that must be one. */
function d(text: string): Decimal {
  return Decimal.parse(text) as Decimal;
}

describe('Decimal', () => {
  it('reads the lexical forms of xs:decimal', () => {
    expect(['1.50', '-0.25', '+.5', '7.', '007', '-0', '0.0'].map((text) => d(text).toString())).toEqual([
      '1.5',
      '-0.25',
      '0.5',
      '7',
      '7',
      '0',
      '0',
    ]);
    expect(['', '.', '+', '1e5', '1.2.3', ' 1', 'abc'].map((text) => Decimal.parse(text))).toEqual(
      Array.from({ length: 7 }, () => undefined)
    );
  });

  it('keeps no trailing zeros, so that equal values have equal parts', () => {
    expect([d('1.500').digits, d('1.500').scale]).toEqual([15n, 1]);
    expect(Decimal.of(1200n, -2).toString()).toBe('120000');
  });

  it('converts from doubles by their shortest decimal form', () => {
    expect([0.1, 1e21, 5e-7, -2.5, 0].map((value) => Decimal.fromNumber(value).toString())).toEqual([
      '0.1',
      '1000000000000000000000',
      '0.0000005',
      '-2.5',
      '0',
    ]);
    expect(codeOf(() => Decimal.fromNumber(Number.NaN))).toBe('FOCA0002');
    expect(codeOf(() => Decimal.fromNumber(Number.POSITIVE_INFINITY))).toBe('FOCA0002');
  });

  it('converts from doubles exactly, to the 100 significant digits any decimal result keeps', () => {
    expect(Decimal.exactly(0.1).toString()).toBe('0.1000000000000000055511151231257827021181583404541015625');
    const tiny = Decimal.exactly(5e-324);
    expect(tiny.add(Decimal.ZERO).compare(tiny)).toBe(0);
    expect(tiny.digits.toString()).toHaveLength(100);
    expect(Decimal.exactly(1e300).toString()).toHaveLength(301);
  });

  it('adds, subtracts and multiplies exactly', () => {
    expect(d('0.1').add(d('0.2')).toString()).toBe('0.3');
    expect(d('1.005').subtract(d('2')).toString()).toBe('-0.995');
    expect(d('1.5').multiply(d('-0.2')).toString()).toBe('-0.3');
  });

  it('divides to at least 18 digits after the point, rounding half to even', () => {
    expect(d('1').divide(d('3')).toString()).toBe('0.333333333333333333');
    expect(d('2').divide(d('3')).toString()).toBe('0.666666666666666667');
    expect(d('-2').divide(d('3')).toString()).toBe('-0.666666666666666667');
    expect(d('1').divide(d('8')).toString()).toBe('0.125');
    // Small quotients keep their digits rather than rounding to zero.
    expect(d('5').divide(d('10000000000000000000')).toString()).toBe('0.0000000000000000005');
    expect(d('-15').divide(d('10000000000000000000')).toString()).toBe('-0.0000000000000000015');
    expect(codeOf(() => d('1').divide(d('0')))).toBe('FOAR0001');
  });

  it('keeps at least 18 significant digits when dividing, however small the quotient', () => {
    expect(d('1').divide(d('700000000000000000000')).toString()).toBe('0.00000000000000000000142857142857142857');
    expect(d('0.00000000000000000001').divide(d('7')).toString()).toBe('0.00000000000000000000142857142857142857');
    // Quotients of everyday size keep 18 places after the point, as before.
    expect(d('1').divide(d('3')).toString()).toBe('0.333333333333333333');
    expect(d('1000').divide(d('3')).toString()).toBe('333.333333333333333333');
  });

  it('rounds results beyond 100 significant digits, half to even, but never the integer part', () => {
    const sixtyOnes = d(`0.${'1'.repeat(60)}`);
    const product = sixtyOnes.multiply(sixtyOnes);
    // The exact product has 119 significant digits at 120 places; it keeps 100, dropping 19.
    const exact = 10n ** 60n / 9n;
    const exactDigits = exact * exact;
    expect(exactDigits.toString()).toHaveLength(119);
    const kept = (exactDigits + 5n * 10n ** 18n) / 10n ** 19n;
    expect([product.digits.toString().length, product.digits, product.scale]).toEqual([100, kept, 101]);
    // An integer part longer than the limit is kept whole; only the fraction is rounded away.
    expect(
      Decimal.of(10n ** 150n)
        .add(d('0.5'))
        .toString()
    ).toBe(`1${'0'.repeat(150)}`);
    expect(
      Decimal.of(10n ** 150n + 1n)
        .add(d('0.5'))
        .toString()
    ).toBe(`1${'0'.repeat(149)}2`);
  });

  it('divides to integers and takes remainders with the sign of the dividend', () => {
    expect(d('7.5').integerDivide(d('2'))).toBe(3n);
    expect(d('-7.5').integerDivide(d('2'))).toBe(-3n);
    expect(d('7.5').modulo(d('2')).toString()).toBe('1.5');
    expect(d('-7.5').modulo(d('2')).toString()).toBe('-1.5');
    expect(codeOf(() => d('1').integerDivide(d('0')))).toBe('FOAR0001');
    expect(codeOf(() => d('1').modulo(d('0')))).toBe('FOAR0001');
  });

  it('compares, truncates and reports its sign', () => {
    expect([d('1.5').compare(d('1.50')), d('1.4').compare(d('1.5')), d('2').compare(d('1.99'))]).toEqual([0, -1, 1]);
    expect([d('-2.7').truncate(), d('2.7').truncate()]).toEqual([-2n, 2n]);
    expect([d('-3').sign(), d('0').sign(), d('0.1').sign()]).toEqual([-1, 0, 1]);
    expect([d('0').isZero(), d('2').isInteger(), d('2.5').isInteger()]).toEqual([true, true, false]);
    expect(d('2.5').negate().toString()).toBe('-2.5');
  });

  it('converts to the nearest double', () => {
    expect(d('0.1').toNumber()).toBe(0.1);
    expect(d('-12.25').toNumber()).toBe(-12.25);
  });
});

describe('Decimal.from', () => {
  it('gives the decimal a lexical form stands for, and raises an InvalidArgumentError for any other text', () => {
    expect(Decimal.from('-1.50').toString()).toBe('-1.5');
    expect(Decimal.from('.5').compare(Decimal.parse('0.5') as Decimal)).toBe(0);
    expect(() => Decimal.from('abc')).toThrow(new InvalidArgumentError('abc is not a decimal number'));
    expect(() => Decimal.from('')).toThrow(InvalidArgumentError);
  });
});

describe('Decimal.round', () => {
  const round = (text: string, places: number, mode: RoundingMode): string =>
    (Decimal.parse(text) as Decimal).round(places, mode).toString();

  it('rounds halves up toward positive infinity, or to even', () => {
    expect([round('2.5', 0, 'half-up'), round('-2.5', 0, 'half-up'), round('2.51', 0, 'half-up')]).toEqual([
      '3',
      '-2',
      '3',
    ]);
    expect([round('2.5', 0, 'half-even'), round('3.5', 0, 'half-even'), round('-2.5', 0, 'half-even')]).toEqual([
      '2',
      '4',
      '-2',
    ]);
    expect([round('-3.5', 0, 'half-even'), round('-2.6', 0, 'half-even'), round('-2.4', 0, 'half-up')]).toEqual([
      '-4',
      '-3',
      '-2',
    ]);
  });

  it('rounds always up or always down', () => {
    expect([
      round('2.1', 0, 'ceiling'),
      round('-2.9', 0, 'ceiling'),
      round('2.9', 0, 'floor'),
      round('-2.1', 0, 'floor'),
    ]).toEqual(['3', '-2', '2', '-3']);
  });

  it('rounds to places after the point, or to tens and hundreds, leaving a shorter value as it is', () => {
    expect([round('1.2345', 2, 'half-even'), round('1250', -2, 'half-even'), round('1.5', 3, 'floor')]).toEqual([
      '1.23',
      '1200',
      '1.5',
    ]);
  });
});
