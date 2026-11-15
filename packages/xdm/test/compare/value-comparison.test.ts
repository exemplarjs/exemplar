import { codeOf, decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import {
  type AtomicType,
  castAs,
  compareAtomic,
  type ComparisonOperator,
  valueCompare,
  XdmAtomicValue,
  XS,
} from '@/index';
import { uncheckedAtomicValue } from '@/internal';

const OPERATORS: readonly ComparisonOperator[] = ['eq', 'ne', 'lt', 'le', 'gt', 'ge'];

/** The result of every operator on two values, in the order eq, ne, lt, le, gt, ge. */
function all(a: XdmAtomicValue, b: XdmAtomicValue): boolean[] {
  return OPERATORS.map((operator) => valueCompare(a, b, operator));
}

describe('valueCompare', () => {
  it('compares numbers of every kind after promotion', () => {
    expect(all(XdmAtomicValue.integer(1n), XdmAtomicValue.integer(2n))).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(all(decimal('0.1'), XdmAtomicValue.double(0.1))).toEqual([true, false, false, true, false, true]);
    expect(all(XdmAtomicValue.integer(3n), decimal('2.5'))).toEqual([false, true, false, false, true, true]);
    const singleTenth = Math.fround(0.1);
    expect(valueCompare(XdmAtomicValue.float(0.1), XdmAtomicValue.double(singleTenth), 'eq')).toBe(true);
    // An integer compared with a float is rounded to the nearest float once.
    const justAboveHalf = XdmAtomicValue.integer(2n ** 60n + 2n ** 36n + 1n);
    const nearestFloat = XdmAtomicValue.float(Number(2n ** 60n + 2n ** 37n));
    expect(valueCompare(justAboveHalf, nearestFloat, 'eq')).toBe(true);
    // The float is promoted to a double, which keeps its single-precision value.
    expect(valueCompare(XdmAtomicValue.float(0.1), XdmAtomicValue.double(0.1), 'eq')).toBe(false);
  });

  it('makes every comparison with NaN false but ne', () => {
    expect(all(XdmAtomicValue.double(Number.NaN), XdmAtomicValue.double(Number.NaN))).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(all(XdmAtomicValue.float(Number.NaN), XdmAtomicValue.integer(1n))).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('compares text by code points, untyped text as a string', () => {
    expect(all(XdmAtomicValue.string('a'), XdmAtomicValue.untypedAtomic('b'))).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(valueCompare(XdmAtomicValue.string('x'), XdmAtomicValue.string('x', XS.token), 'eq')).toBe(true);
    expect(valueCompare(new XdmAtomicValue(XS.anyURI, 'urn:a'), XdmAtomicValue.string('urn:a'), 'eq')).toBe(true);
  });

  it('puts false before true', () => {
    expect(all(XdmAtomicValue.boolean(false), XdmAtomicValue.boolean(true))).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('compares binary values of one type byte by byte', () => {
    const hex = (...bytes: number[]): XdmAtomicValue => new XdmAtomicValue(XS.hexBinary, new Uint8Array(bytes));
    expect(all(hex(1, 2), hex(1, 3))).toEqual([false, true, true, true, false, false]);
    expect(codeOf(() => valueCompare(hex(1), new XdmAtomicValue(XS.base64Binary, new Uint8Array([1])), 'eq'))).toBe(
      'XPTY0004'
    );
  });

  it('compares QNames for equality only', () => {
    const qname = (uri: string, local: string, prefix = ''): XdmAtomicValue =>
      new XdmAtomicValue(XS.QName, new QName(uri, local, prefix));
    expect(valueCompare(qname('urn:a', 'x', 'p'), qname('urn:a', 'x', 'q'), 'eq')).toBe(true);
    expect(valueCompare(qname('urn:a', 'x'), qname('urn:b', 'x'), 'ne')).toBe(true);
    expect(codeOf(() => valueCompare(qname('urn:a', 'x'), qname('urn:a', 'x'), 'lt'))).toBe('XPTY0004');
  });

  it('raises XPTY0004 for values of types that do not compare', () => {
    expect(codeOf(() => valueCompare(XdmAtomicValue.integer(1n), XdmAtomicValue.string('1'), 'eq'))).toBe('XPTY0004');
    expect(codeOf(() => valueCompare(XdmAtomicValue.boolean(true), XdmAtomicValue.integer(1n), 'eq'))).toBe('XPTY0004');
  });
});

describe('valueCompare with dates, times and durations', () => {
  const value = (type: AtomicType, text: string): XdmAtomicValue => castAs(XdmAtomicValue.string(text), type);
  /** Minutes east of UTC of the timezone +01:00. */
  const PLUS_ONE_HOUR = 60;

  it('takes the implicit timezone from the options for values without one', () => {
    const local = value(XS.time, '10:00:00');
    const utc = value(XS.time, '09:00:00Z');
    expect(valueCompare(local, utc, 'eq', { implicitTimezone: PLUS_ONE_HOUR })).toBe(true);
    expect(valueCompare(local, utc, 'gt', { implicitTimezone: 0 })).toBe(true);
  });

  it("takes the machine's timezone when the options give none", () => {
    const offset = -new Date().getTimezoneOffset();
    const sign = offset < 0 ? '-' : '+';
    const zone = `${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
    expect(
      valueCompare(value(XS.dateTime, '2024-01-01T00:00:00'), value(XS.dateTime, `2024-01-01T00:00:00${zone}`), 'eq')
    ).toBe(true);
  });

  it('orders dates and times, but compares xs:g* values for equality only', () => {
    expect(all(value(XS.date, '2024-01-01Z'), value(XS.date, '2024-01-02Z'))).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(valueCompare(value(XS.gYear, '2024Z'), value(XS.gYear, '2024Z'), 'eq')).toBe(true);
    expect(codeOf(() => valueCompare(value(XS.gYear, '2024Z'), value(XS.gYear, '2024Z'), 'lt'))).toBe('XPTY0004');
    expect(codeOf(() => valueCompare(value(XS.date, '2024-01-01'), value(XS.time, '00:00:00'), 'eq'))).toBe('XPTY0004');
  });

  it('compares a year-month and a day-time duration for equality, P0M equal to PT0S', () => {
    expect(valueCompare(value(XS.yearMonthDuration, 'P0M'), value(XS.dayTimeDuration, 'PT0S'), 'eq')).toBe(true);
    expect(valueCompare(value(XS.yearMonthDuration, 'P1M'), value(XS.dayTimeDuration, 'P30D'), 'ne')).toBe(true);
    expect(
      codeOf(() => valueCompare(value(XS.yearMonthDuration, 'P1M'), value(XS.dayTimeDuration, 'P30D'), 'lt'))
    ).toBe('XPTY0004');
    expect(codeOf(() => valueCompare(value(XS.duration, 'P1M'), value(XS.duration, 'P2M'), 'lt'))).toBe('XPTY0004');
    expect(valueCompare(value(XS.dayTimeDuration, 'PT1H'), value(XS.dayTimeDuration, 'PT59M'), 'gt')).toBe(true);
  });

  it('raises XPTY0004 for a date or duration compared with a value of another kind', () => {
    expect(codeOf(() => valueCompare(value(XS.date, '2024-01-01'), XdmAtomicValue.string('2024-01-01'), 'eq'))).toBe(
      'XPTY0004'
    );
    expect(codeOf(() => valueCompare(value(XS.dayTimeDuration, 'P1D'), XdmAtomicValue.integer(1n), 'eq'))).toBe(
      'XPTY0004'
    );
  });
});

describe('valueCompare with a string comparison', () => {
  it('compares text with the function the options give', () => {
    const ignoringCase = (a: string, b: string): number => a.toLowerCase().localeCompare(b.toLowerCase());
    expect(
      valueCompare(XdmAtomicValue.string('ABC'), XdmAtomicValue.string('abc'), 'eq', { compareStrings: ignoringCase })
    ).toBe(true);
    expect(valueCompare(XdmAtomicValue.string('ABC'), XdmAtomicValue.string('abc'), 'eq')).toBe(false);
  });
});

describe('compareAtomic', () => {
  it('orders values of each kind both ways', () => {
    const integers = [XdmAtomicValue.integer(2n), XdmAtomicValue.integer(1n)] as const;
    expect([compareAtomic(integers[0], integers[1], true), compareAtomic(integers[0], integers[0], true)]).toEqual([
      1, 0,
    ]);
    expect(compareAtomic(XdmAtomicValue.double(2), XdmAtomicValue.double(1), true)).toBe(1);
    expect(compareAtomic(XdmAtomicValue.double(1), XdmAtomicValue.double(2), true)).toBe(-1);
    const notation = uncheckedAtomicValue(XS.NOTATION, new QName('', 'gif'));
    expect(compareAtomic(notation, notation, false)).toBe(0);
  });

  it('orders values, giving NaN when they are unordered', () => {
    expect(compareAtomic(XdmAtomicValue.string('b'), XdmAtomicValue.string('a'), true)).toBe(1);
    expect(compareAtomic(XdmAtomicValue.double(Number.NaN), XdmAtomicValue.double(1), true)).toBeNaN();
  });
});

describe('compareAtomic, found in review', () => {
  const date = (text: string): XdmAtomicValue => castAs(XdmAtomicValue.string(text), XS.date);

  it('raises a RangeError for an implicit timezone that is not one', () => {
    expect(() => compareAtomic(date('2024-01-01'), date('2024-01-01'), false, { implicitTimezone: 0.5 })).toThrow(
      RangeError
    );
    expect(() => compareAtomic(date('2024-01-01'), date('2024-01-01'), false, { implicitTimezone: 5000 })).toThrow(
      RangeError
    );
  });
});
