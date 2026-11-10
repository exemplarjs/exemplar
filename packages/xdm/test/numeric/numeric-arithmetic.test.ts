import { codeOf, decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { type ArithmeticOperator, numericArithmetic, numericNegate, XdmAtomicValue, XS } from '@/index';

/** The type and text of an arithmetic result. */
function result(operator: ArithmeticOperator, a: XdmAtomicValue, b: XdmAtomicValue): string {
  return numericArithmetic(operator, a, b).toString();
}

const integer = (value: bigint): XdmAtomicValue => XdmAtomicValue.integer(value);

describe('numericArithmetic', () => {
  it('keeps integers exact and of type xs:integer, whatever their subtype', () => {
    expect(result('+', integer(2n ** 62n), integer(2n ** 62n))).toBe('xs:integer("9223372036854775808")');
    expect(result('-', XdmAtomicValue.integer(5n, XS.byte), integer(7n))).toBe('xs:integer("-2")');
    expect(result('*', integer(-3n), integer(4n))).toBe('xs:integer("-12")');
    expect(result('idiv', integer(-7n), integer(2n))).toBe('xs:integer("-3")');
    expect(result('mod', integer(-7n), integer(2n))).toBe('xs:integer("-1")');
  });

  it('divides integers to a decimal', () => {
    expect(result('div', integer(1n), integer(4n))).toBe('xs:decimal("0.25")');
    expect(codeOf(() => numericArithmetic('div', integer(1n), integer(0n)))).toBe('FOAR0001');
    expect(codeOf(() => numericArithmetic('idiv', integer(1n), integer(0n)))).toBe('FOAR0001');
  });

  it('promotes integers and decimals to decimals, exactly', () => {
    expect(result('+', decimal('0.1'), decimal('0.2'))).toBe('xs:decimal("0.3")');
    expect(result('-', integer(1n), decimal('0.25'))).toBe('xs:decimal("0.75")');
    expect(result('*', decimal('1.5'), decimal('1.5'))).toBe('xs:decimal("2.25")');
    expect(result('div', decimal('1'), decimal('3'))).toBe('xs:decimal("0.333333333333333333")');
    expect(result('idiv', decimal('7.5'), decimal('2'))).toBe('xs:integer("3")');
    expect(result('mod', decimal('7.5'), decimal('2'))).toBe('xs:decimal("1.5")');
  });

  it('promotes to float, then double, as IEEE 754 computes them', () => {
    expect(result('+', XdmAtomicValue.float(0.1), integer(1n))).toBe('xs:float("1.1")');
    expect(result('+', XdmAtomicValue.float(0.1), XdmAtomicValue.double(1))).toBe(
      `xs:double("${String(Math.fround(0.1) + 1)}")`
    );
    expect(result('-', XdmAtomicValue.double(1), decimal('0.5'))).toBe('xs:double("0.5")');
    expect(result('*', XdmAtomicValue.double(2), XdmAtomicValue.double(3))).toBe('xs:double("6")');
    expect(result('div', XdmAtomicValue.double(1), XdmAtomicValue.double(0))).toBe('xs:double("INF")');
    expect(result('mod', XdmAtomicValue.double(-7), XdmAtomicValue.double(2))).toBe('xs:double("-1")');
    expect(result('mod', XdmAtomicValue.double(1), XdmAtomicValue.double(0))).toBe('xs:double("NaN")');
  });

  it('divides doubles to integers, refusing zero divisors, NaN and infinities', () => {
    expect(result('idiv', XdmAtomicValue.double(7.9), XdmAtomicValue.float(2))).toBe('xs:integer("3")');
    expect(codeOf(() => numericArithmetic('idiv', XdmAtomicValue.double(1), XdmAtomicValue.double(0)))).toBe(
      'FOAR0001'
    );
    expect(codeOf(() => numericArithmetic('idiv', XdmAtomicValue.double(Number.NaN), XdmAtomicValue.double(1)))).toBe(
      'FOAR0002'
    );
    expect(
      codeOf(() => numericArithmetic('idiv', XdmAtomicValue.double(Number.POSITIVE_INFINITY), XdmAtomicValue.double(1)))
    ).toBe('FOAR0002');
  });

  it('raises XPTY0004 for operands that are not numbers', () => {
    expect(codeOf(() => numericArithmetic('+', integer(1n), XdmAtomicValue.string('1')))).toBe('XPTY0004');
    expect(codeOf(() => numericArithmetic('+', XdmAtomicValue.untypedAtomic('1'), integer(1n)))).toBe('XPTY0004');
  });
});

describe('numericArithmetic with floats', () => {
  const float = (value: number): XdmAtomicValue => XdmAtomicValue.float(value);

  it('rounds integer and decimal operands to float before the operation, as XPath promotes them', () => {
    expect(result('-', integer(16_777_217n), float(16_777_216))).toBe('xs:float("0")');
    expect(result('+', float(1), integer(16_777_217n))).toBe('xs:float("1.6777216E7")');
    expect(result('mod', integer(16_777_217n), float(16_777_216))).toBe('xs:float("0")');
    expect(result('-', decimal('1.00000001'), float(1))).toBe('xs:float("0")');
    expect(result('idiv', integer(16_777_217n), float(1))).toBe('xs:integer("16777216")');
  });

  it('gives the exact quotient, truncated, for idiv of floats and doubles', () => {
    // 41252084 / 1.0140340… is 40681163.22 exactly, though it rounds to 40681164 as a float.
    expect(result('idiv', float(41_252_084), float(1.0140340328216553))).toBe('xs:integer("40681163")');
    // Beyond 2^53 a double cannot hold the quotient's integer part, which double division then loses.
    const dividend = XdmAtomicValue.double(33_492_345_085_715_330);
    expect(result('idiv', dividend, XdmAtomicValue.double(1.0000000005521155))).toBe('xs:integer("33492345067223686")');
    expect(result('idiv', XdmAtomicValue.double(-7.5), XdmAtomicValue.double(2))).toBe('xs:integer("-3")');
    expect(result('idiv', XdmAtomicValue.double(5), XdmAtomicValue.double(Number.POSITIVE_INFINITY))).toBe(
      'xs:integer("0")'
    );
  });
});

describe('numericNegate', () => {
  it('negates each kind of number, keeping its kind', () => {
    expect(
      [integer(3n), decimal('1.5'), XdmAtomicValue.float(2), XdmAtomicValue.double(0)].map((value) =>
        numericNegate(value).toString()
      )
    ).toEqual(['xs:integer("-3")', 'xs:decimal("-1.5")', 'xs:float("-2")', 'xs:double("-0")']);
    expect(codeOf(() => numericNegate(XdmAtomicValue.boolean(true)))).toBe('XPTY0004');
  });
});
