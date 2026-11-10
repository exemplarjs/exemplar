import { codeOf, decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { addSeconds } from '@/date-time/date-time-arithmetic';
import {
  type ArithmeticOperator,
  atomicArithmetic,
  type AtomicType,
  castAs,
  Decimal,
  Duration,
  XdmAtomicValue,
  XMLGregorianCalendar,
  XS,
} from '@/index';

/** Minutes east of UTC of some implicit timezones. */
const UTC = 0;
const MINUS_FIVE_HOURS = -300;
const LAST_YEAR = Number.MAX_SAFE_INTEGER;

/** A value of a type from its lexical form. */
const value = (type: AtomicType, text: string): XdmAtomicValue => castAs(XdmAtomicValue.string(text), type);
const date = (text: string): XdmAtomicValue => value(XS.date, text);
const dateTime = (text: string): XdmAtomicValue => value(XS.dateTime, text);
const time = (text: string): XdmAtomicValue => value(XS.time, text);
const yearMonth = (text: string): XdmAtomicValue => value(XS.yearMonthDuration, text);
const dayTime = (text: string): XdmAtomicValue => value(XS.dayTimeDuration, text);
const integer = (number: number): XdmAtomicValue => XdmAtomicValue.integer(number);
const double = (number: number): XdmAtomicValue => XdmAtomicValue.double(number);

/** The result of an operator as its type and canonical text, such as `xs:date 2024-02-29`. */
function apply(operator: ArithmeticOperator, a: XdmAtomicValue, b: XdmAtomicValue, implicitTimezone = UTC): string {
  const result = atomicArithmetic(operator, a, b, implicitTimezone);
  return `${result.type.toString()} ${result.stringValue}`;
}

/** The error code an operator raises. */
const failure = (operator: ArithmeticOperator, a: XdmAtomicValue, b: XdmAtomicValue): string | undefined =>
  codeOf(() => atomicArithmetic(operator, a, b, UTC));

describe('atomicArithmetic between durations (F&O §8.4 examples)', () => {
  it('adds and subtracts durations of one subtype', () => {
    expect(apply('+', yearMonth('P2Y11M'), yearMonth('P3Y3M'))).toBe('xs:yearMonthDuration P6Y2M');
    expect(apply('-', yearMonth('P2Y11M'), yearMonth('P3Y3M'))).toBe('xs:yearMonthDuration -P4M');
    expect(apply('+', dayTime('P2DT12H5M'), dayTime('P5DT12H'))).toBe('xs:dayTimeDuration P8DT5M');
    expect(apply('-', dayTime('P2DT12H'), dayTime('P1DT10H30M'))).toBe('xs:dayTimeDuration P1DT1H30M');
  });

  it('divides durations of one subtype, giving their ratio as a decimal', () => {
    expect(apply('div', yearMonth('P3Y4M'), yearMonth('-P1Y4M'))).toBe('xs:decimal -2.5');
    expect(apply('div', dayTime('P2DT53M11S'), dayTime('P1DT10H'))).toMatch(/^xs:decimal 1\.43783496732026143/);
    expect(apply('div', dayTime('PT1H'), dayTime('PT30M'))).toBe('xs:decimal 2');
  });

  it('raises FOAR0001 for a division by a zero duration', () => {
    expect(failure('div', yearMonth('P1M'), yearMonth('P0M'))).toBe('FOAR0001');
    expect(failure('div', dayTime('PT1S'), dayTime('PT0S'))).toBe('FOAR0001');
  });

  it('raises FODT0002 when months overflow', () => {
    const most = XdmAtomicValue.duration(new Duration(XS.yearMonthDuration, LAST_YEAR, Decimal.of(0n)));
    expect(failure('+', most, yearMonth('P1M'))).toBe('FODT0002');
    expect(failure('-', yearMonth('-P1M'), most)).toBe('FODT0002');
  });

  it('raises XPTY0004 for durations of different subtypes, xs:duration, or other operators', () => {
    expect(failure('+', yearMonth('P1M'), dayTime('P1D'))).toBe('XPTY0004');
    expect(failure('+', value(XS.duration, 'P1M'), value(XS.duration, 'P1M'))).toBe('XPTY0004');
    expect(failure('*', dayTime('P1D'), dayTime('P1D'))).toBe('XPTY0004');
    expect(failure('mod', yearMonth('P1M'), yearMonth('P1M'))).toBe('XPTY0004');
  });
});

describe('atomicArithmetic scaling durations by numbers (F&O §8.4 examples)', () => {
  it('multiplies and divides day-time durations exactly', () => {
    expect(apply('*', dayTime('PT2H10M'), decimal('2.1'))).toBe('xs:dayTimeDuration PT4H33M');
    expect(apply('div', dayTime('P1DT2H30M10.5S'), decimal('1.5'))).toBe('xs:dayTimeDuration PT17H40M7S');
    expect(apply('*', integer(2), dayTime('PT1H'))).toBe('xs:dayTimeDuration PT2H');
    expect(apply('*', dayTime('PT1H'), XdmAtomicValue.float(0.5))).toBe('xs:dayTimeDuration PT30M');
  });

  it('rounds year-month durations to the nearest month, halves up', () => {
    expect(apply('*', yearMonth('P2Y11M'), decimal('2.3'))).toBe('xs:yearMonthDuration P6Y9M');
    expect(apply('div', yearMonth('P2Y11M'), decimal('1.5'))).toBe('xs:yearMonthDuration P1Y11M');
    expect(apply('*', yearMonth('P1M'), decimal('1.5'))).toBe('xs:yearMonthDuration P2M');
    expect(apply('div', yearMonth('P3M'), integer(2))).toBe('xs:yearMonthDuration P2M');
    // Halves go toward positive infinity, as fn:round has them.
    expect(apply('*', yearMonth('P1M'), decimal('-1.5'))).toBe('xs:yearMonthDuration -P1M');
    expect(apply('*', yearMonth('P1M'), decimal('-1.6'))).toBe('xs:yearMonthDuration -P2M');
  });

  it('gives a zero duration for a division by an infinity', () => {
    expect(apply('div', dayTime('P1D'), double(Number.POSITIVE_INFINITY))).toBe('xs:dayTimeDuration PT0S');
    expect(apply('div', yearMonth('P1Y'), double(Number.NEGATIVE_INFINITY))).toBe('xs:yearMonthDuration P0M');
  });

  it('raises FOCA0005 for NaN', () => {
    expect(failure('*', dayTime('P1D'), double(Number.NaN))).toBe('FOCA0005');
    expect(failure('div', yearMonth('P1Y'), XdmAtomicValue.float(Number.NaN))).toBe('FOCA0005');
    expect(failure('*', double(Number.NaN), yearMonth('P1Y'))).toBe('FOCA0005');
  });

  it('raises FODT0002 for an infinite result: times an infinity or divided by zero', () => {
    expect(failure('*', dayTime('P1D'), double(Number.POSITIVE_INFINITY))).toBe('FODT0002');
    expect(failure('*', yearMonth('P1Y'), double(Number.NEGATIVE_INFINITY))).toBe('FODT0002');
    expect(failure('div', dayTime('P1D'), integer(0))).toBe('FODT0002');
    expect(failure('div', yearMonth('P1Y'), double(-0))).toBe('FODT0002');
  });

  it('raises FODT0002 for more months than the safe integers hold', () => {
    expect(failure('*', yearMonth('P1Y'), double(1e300))).toBe('FODT0002');
  });

  it('raises XPTY0004 for xs:duration, a number divided by a duration, or a number added', () => {
    expect(failure('*', value(XS.duration, 'P1D'), integer(2))).toBe('XPTY0004');
    expect(failure('*', integer(2), value(XS.duration, 'P1D'))).toBe('XPTY0004');
    expect(failure('div', integer(2), dayTime('P1D'))).toBe('XPTY0004');
    expect(failure('+', dayTime('P1D'), integer(2))).toBe('XPTY0004');
    expect(failure('idiv', dayTime('P1D'), integer(2))).toBe('XPTY0004');
  });
});

describe('atomicArithmetic subtracting dates and times (F&O §9.7 examples)', () => {
  it('gives the time between two values as a day-time duration', () => {
    expect(apply('-', date('2000-10-30'), date('1999-11-28'))).toBe('xs:dayTimeDuration P337D');
    expect(apply('-', date('2000-10-15-05:00'), date('2000-10-10+02:00'))).toBe('xs:dayTimeDuration P5DT7H');
    expect(apply('-', time('11:00:00-05:00'), time('21:30:00+05:30'))).toBe('xs:dayTimeDuration PT0S');
    expect(apply('-', time('17:00:00-06:00'), time('08:00:00+09:00'))).toBe('xs:dayTimeDuration P1D');
    expect(apply('-', time('24:00:00'), time('23:59:59'))).toBe('xs:dayTimeDuration -PT23H59M59S');
  });

  it('puts a value without a timezone in the implicit one', () => {
    const later = dateTime('2000-10-30T06:12:00');
    expect(apply('-', later, dateTime('1999-11-28T09:00:00Z'), MINUS_FIVE_HOURS)).toBe(
      'xs:dayTimeDuration P337DT2H12M'
    );
    expect(apply('-', time('11:12:00Z'), time('04:00:00'), MINUS_FIVE_HOURS)).toBe('xs:dayTimeDuration PT2H12M');
  });

  it('subtracts a xs:dateTimeStamp from a xs:dateTime', () => {
    const stamp = value(XS.dateTimeStamp, '2024-01-01T00:00:00Z');
    expect(apply('-', dateTime('2024-01-02T00:00:00.5Z'), stamp)).toBe('xs:dayTimeDuration P1DT0.5S');
  });

  it('raises XPTY0004 for values of different types, xs:g* values, or other operators', () => {
    expect(failure('-', date('2024-01-01'), dateTime('2024-01-01T00:00:00'))).toBe('XPTY0004');
    expect(failure('-', value(XS.gYear, '2024'), value(XS.gYear, '2023'))).toBe('XPTY0004');
    expect(failure('+', date('2024-01-01'), date('2024-01-01'))).toBe('XPTY0004');
    expect(failure('-', date('2024-01-01'), integer(1))).toBe('XPTY0004');
  });
});

describe('atomicArithmetic moving dates and times by durations (F&O §9.7 examples)', () => {
  it('moves a date and time by months or by seconds', () => {
    const start = dateTime('2000-10-30T11:12:00');
    expect(apply('+', start, yearMonth('P1Y2M'))).toBe('xs:dateTime 2001-12-30T11:12:00');
    expect(apply('+', start, dayTime('P3DT1H15M'))).toBe('xs:dateTime 2000-11-02T12:27:00');
    expect(apply('-', start, yearMonth('P1Y2M'))).toBe('xs:dateTime 1999-08-30T11:12:00');
    expect(apply('-', start, dayTime('P3DT1H15M'))).toBe('xs:dateTime 2000-10-27T09:57:00');
  });

  it('moves a date by months, or by the whole days of its midnight moved', () => {
    expect(apply('+', date('2004-10-30Z'), yearMonth('P1Y2M'))).toBe('xs:date 2005-12-30Z');
    expect(apply('+', date('2004-10-30Z'), dayTime('P2DT2H30M0S'))).toBe('xs:date 2004-11-01Z');
    expect(apply('-', date('2000-10-30'), yearMonth('P1Y2M'))).toBe('xs:date 1999-08-30');
    expect(apply('-', date('2000-10-30'), dayTime('P3DT1H15M'))).toBe('xs:date 2000-10-26');
    expect(apply('-', date('2004-10-30'), dayTime('PT1S'))).toBe('xs:date 2004-10-29');
  });

  it('pins the day to the end of a shorter month', () => {
    expect(apply('+', date('2024-01-31'), yearMonth('P1M'))).toBe('xs:date 2024-02-29');
    expect(apply('+', date('2023-01-31'), yearMonth('P1M'))).toBe('xs:date 2023-02-28');
    expect(apply('-', date('2000-02-29Z'), yearMonth('P1Y'))).toBe('xs:date 1999-02-28Z');
    expect(apply('+', dateTime('2024-03-31T10:00:00'), yearMonth('P1M'))).toBe('xs:dateTime 2024-04-30T10:00:00');
  });

  it('moves across year 0 and before it', () => {
    expect(apply('-', date('0000-01-31'), yearMonth('P1M'))).toBe('xs:date -0001-12-31');
    expect(apply('-', date('0000-03-01'), dayTime('P1D'))).toBe('xs:date 0000-02-29');
    expect(apply('+', date('-0001-12-31'), dayTime('P1D'))).toBe('xs:date 0000-01-01');
  });

  it('moves a time around the clock, keeping its timezone', () => {
    expect(apply('+', time('11:12:00'), dayTime('P3DT1H15M'))).toBe('xs:time 12:27:00');
    expect(apply('+', time('23:12:00+03:00'), dayTime('P1DT3H15M'))).toBe('xs:time 02:27:00+03:00');
    expect(apply('-', time('11:12:00'), dayTime('P3DT1H15M'))).toBe('xs:time 09:57:00');
    expect(apply('-', time('08:20:00-05:00'), dayTime('P23DT10H10M'))).toBe('xs:time 22:10:00-05:00');
    expect(apply('-', time('00:00:00.25'), dayTime('PT0.5S'))).toBe('xs:time 23:59:59.75');
  });

  it('adds a duration before the date as well as after it, a xs:dateTimeStamp giving a xs:dateTime', () => {
    expect(apply('+', yearMonth('P1M'), date('2024-01-31'))).toBe('xs:date 2024-02-29');
    expect(apply('+', dayTime('PT1H'), value(XS.dateTimeStamp, '2024-01-01T23:30:00Z'))).toBe(
      'xs:dateTime 2024-01-02T00:30:00Z'
    );
  });

  it('raises FODT0001 for a year beyond the safe integers', () => {
    const lastDay = date(`${LAST_YEAR}-12-31`);
    expect(failure('+', lastDay, yearMonth('P1M'))).toBe('FODT0001');
    expect(failure('+', lastDay, dayTime('P1D'))).toBe('FODT0001');
  });

  it('raises XPTY0004 for a duration a type cannot move by, or one taken from a duration', () => {
    expect(failure('+', time('10:00:00'), yearMonth('P1M'))).toBe('XPTY0004');
    expect(failure('+', value(XS.gYear, '2024'), yearMonth('P1Y'))).toBe('XPTY0004');
    expect(failure('+', date('2024-01-01'), value(XS.duration, 'P1D'))).toBe('XPTY0004');
    expect(failure('-', dayTime('P1D'), date('2024-01-01'))).toBe('XPTY0004');
    expect(failure('*', date('2024-01-01'), dayTime('P1D'))).toBe('XPTY0004');
  });
});

describe('atomicArithmetic on other values', () => {
  it('applies numeric arithmetic when neither operand is a date, time or duration, XPTY0004 for other types', () => {
    expect(apply('+', integer(1), integer(2))).toBe('xs:integer 3');
    expect(failure('+', XdmAtomicValue.string('a'), integer(2))).toBe('XPTY0004');
  });
});

describe('addSeconds', () => {
  it('moves a value in its own local time, by any exact number of seconds', () => {
    const start = XMLGregorianCalendar.parse('2024-12-31T23:59:59.5+14:00', XS.dateTime);
    expect(addSeconds(start, decimal('0.5').value as Decimal).toString()).toBe('2025-01-01T00:00:00+14:00');
    expect(addSeconds(start, Decimal.of(-86_400n * 366n)).toString()).toBe('2023-12-31T23:59:59.5+14:00');
  });
});

describe('atomicArithmetic, found in review', () => {
  it('raises FODT0002 for a day-time duration scaled beyond its range', () => {
    expect(codeOf(() => apply('*', dayTime('P1D'), double(1e300)))).toBe('FODT0002');
  });
});
