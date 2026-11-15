import { codeOf, decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { XdmAtomicValue, XS } from '@/index';
import { NumericKind, numericKind, toDecimal, toDouble, toInteger } from '@/numeric/numeric-values';

describe('numeric values', () => {
  it('tells the kinds of number apart', () => {
    const values = [
      XdmAtomicValue.integer(1n, XS.short),
      decimal('1.5'),
      XdmAtomicValue.float(1),
      XdmAtomicValue.double(1),
      XdmAtomicValue.string('1'),
    ];
    expect(values.map((value) => numericKind(value))).toEqual([
      NumericKind.INTEGER,
      NumericKind.DECIMAL,
      NumericKind.FLOAT,
      NumericKind.DOUBLE,
      undefined,
    ]);
  });

  it('converts numbers and booleans to doubles, decimals and integers', () => {
    const half = decimal('2.5');
    expect([toDouble(half), toDouble(XdmAtomicValue.boolean(true)), toDouble(XdmAtomicValue.integer(3n))]).toEqual([
      2.5, 1, 3,
    ]);
    expect(toDecimal(XdmAtomicValue.double(0.25)).toString()).toBe('0.25');
    expect(toDecimal(XdmAtomicValue.boolean(false)).toString()).toBe('0');
    expect(toDecimal(XdmAtomicValue.integer(4n)).toString()).toBe('4');
    expect([toInteger(half), toInteger(XdmAtomicValue.double(-2.9)), toInteger(XdmAtomicValue.boolean(true))]).toEqual([
      2n,
      -2n,
      1n,
    ]);
    expect(toInteger(XdmAtomicValue.boolean(false))).toBe(0n);
    expect(codeOf(() => toInteger(XdmAtomicValue.double(Number.NaN)))).toBe('FOCA0002');
  });
});
