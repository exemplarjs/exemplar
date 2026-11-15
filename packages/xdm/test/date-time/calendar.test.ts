import { codeOf } from '@test/helpers/values';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { fieldsOf } from '@/date-time/calendar';
import { type CalendarFields, Decimal, XMLGregorianCalendar, XS } from '@/index';

const ZERO = Decimal.of(0n);
const NOON = { hour: 12, minute: 0, second: 0, fractionalSecond: ZERO };
/** Minutes east of UTC of the timezone +01:00. */
const PLUS_ONE_HOUR = 60;

describe('XMLGregorianCalendar', () => {
  it('holds the fields of its kind and leaves the others undefined', () => {
    const leapDay = XMLGregorianCalendar.parse('2024-02-29+01:00', XS.date);
    expect([leapDay.year, leapDay.month, leapDay.day, leapDay.timezone]).toEqual([2024, 2, 29, PLUS_ONE_HOUR]);
    expect([leapDay.hour, leapDay.minute, leapDay.second, leapDay.fractionalSecond]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(leapDay.kind).toBe('date');
    expect(leapDay.xmlSchemaType).toBe(XS.date);
  });

  it('writes its canonical form', () => {
    expect(XMLGregorianCalendar.parse('2024-02-29T23:59:59.500+00:00', XS.dateTime).toString()).toBe(
      '2024-02-29T23:59:59.5Z'
    );
    expect(XMLGregorianCalendar.parse('2024-02-29T24:00:00', XS.dateTime).toString()).toBe('2024-03-01T00:00:00');
    expect(new XMLGregorianCalendar(XS.gMonthDay, { month: 2, day: 29 }).toString()).toBe('--02-29');
  });

  it('raises FORG0001 for text that is not of its type', () => {
    expect(codeOf(() => XMLGregorianCalendar.parse('2023-02-29', XS.date))).toBe('FORG0001');
    expect(codeOf(() => XMLGregorianCalendar.parse('2024-01-01T00:00:00', XS.dateTimeStamp))).toBe('FORG0001');
  });

  it('reads the timezone -00:00 as 0, not negative zero', () => {
    expect(XMLGregorianCalendar.parse('2024-01-01-00:00', XS.date).timezone).toBe(0);
  });
});

describe('the XMLGregorianCalendar constructor', () => {
  it('needs exactly the date fields of its kind', () => {
    expect(codeOf(() => new XMLGregorianCalendar(XS.date, { year: 2024, month: 1 }))).toBe('FORG0001');
    expect(codeOf(() => new XMLGregorianCalendar(XS.gYear, { year: 2024, month: 1 }))).toBe('FORG0001');
    expect(codeOf(() => new XMLGregorianCalendar(XS.gDay, { day: 1, year: 2024 }))).toBe('FORG0001');
  });

  it('needs exactly the time fields of its kind', () => {
    expect(codeOf(() => new XMLGregorianCalendar(XS.date, { year: 2024, month: 1, day: 1, hour: 0 }))).toBe('FORG0001');
    expect(codeOf(() => new XMLGregorianCalendar(XS.time, { hour: 12, minute: 0 }))).toBe('FORG0001');
    const fractionOnADate = { year: 2024, month: 1, day: 1, fractionalSecond: ZERO };
    expect(codeOf(() => new XMLGregorianCalendar(XS.date, fractionOnADate))).toBe('FORG0001');
    expect(codeOf(() => XMLGregorianCalendar.parse('2024-01-01T00:00:00', XS.dateTimeStamp))).toBe('FORG0001');
  });

  it('needs a safe integer year, a month from 1 to 12 and a day in its month', () => {
    for (const fields of [
      { year: 1.5, month: 1, day: 1 },
      { year: 2 ** 60, month: 1, day: 1 },
      { year: 2024, month: 13, day: 1 },
      { year: 2024, month: 0.5, day: 1 },
      { year: 2024, month: 4, day: 31 },
      { year: 2023, month: 2, day: 29 },
      { year: 2024, month: 1, day: 0 },
    ]) {
      expect(codeOf(() => new XMLGregorianCalendar(XS.date, fields))).toBe('FORG0001');
    }
    expect(new XMLGregorianCalendar(XS.gDay, { day: 31 }).day).toBe(31);
  });

  it('needs a time from 00:00:00 to 23:59:59 and a fraction from 0 to below 1', () => {
    for (const fields of [
      { ...NOON, hour: 24 },
      { ...NOON, minute: 60 },
      { ...NOON, second: 60 },
      { ...NOON, second: -1 },
      { ...NOON, fractionalSecond: Decimal.of(1n) },
      { ...NOON, fractionalSecond: Decimal.parse('-0.5') as Decimal },
    ]) {
      expect(codeOf(() => new XMLGregorianCalendar(XS.time, fields))).toBe('FORG0001');
    }
    expect(
      new XMLGregorianCalendar(XS.time, { ...NOON, fractionalSecond: Decimal.parse('0.999') as Decimal }).toString()
    ).toBe('12:00:00.999');
  });

  it('needs a timezone of whole minutes within 14 hours, and one for xs:dateTimeStamp', () => {
    for (const timezone of [841, -841, 1.5]) {
      expect(codeOf(() => new XMLGregorianCalendar(XS.time, { ...NOON, timezone }))).toBe('FORG0001');
    }
    const stamp = { year: 2024, month: 1, day: 1, ...NOON };
    expect(codeOf(() => new XMLGregorianCalendar(XS.dateTimeStamp, stamp))).toBe('FORG0001');
    expect(new XMLGregorianCalendar(XS.dateTimeStamp, { ...stamp, timezone: -840 }).timezone).toBe(-840);
  });
});

describe('XMLGregorianCalendar.toDate', () => {
  it('gives the instant of a date and time with a timezone, milliseconds kept and finer fractions dropped', () => {
    const instant = XMLGregorianCalendar.parse('2024-02-29T12:34:56.7899+01:00', XS.dateTime).toDate();
    expect(instant.toISOString()).toBe('2024-02-29T11:34:56.789Z');
  });

  it('gives a date at its midnight', () => {
    expect(XMLGregorianCalendar.parse('2024-02-29-05:00', XS.date).toDate().toISOString()).toBe(
      '2024-02-29T05:00:00.000Z'
    );
  });

  it('takes the zone it is given for a value without a timezone, as minutes or as an offset', () => {
    const local = XMLGregorianCalendar.parse('2024-02-29T12:00:00', XS.dateTime);
    expect(local.toDate(PLUS_ONE_HOUR).toISOString()).toBe('2024-02-29T11:00:00.000Z');
    expect(local.toDate('-05:00').toISOString()).toBe('2024-02-29T17:00:00.000Z');
    expect(local.toDate('Z').toISOString()).toBe('2024-02-29T12:00:00.000Z');
  });

  it('ignores the zone it is given when the value has a timezone', () => {
    const utc = XMLGregorianCalendar.parse('2024-02-29T12:00:00Z', XS.dateTimeStamp);
    expect(utc.toDate('+05:00').toISOString()).toBe('2024-02-29T12:00:00.000Z');
  });

  it("takes the machine's local time for a value with neither", () => {
    const local = XMLGregorianCalendar.parse('2024-02-29T12:34:56.5', XS.dateTime).toDate();
    expect(local.getTime()).toBe(new Date(2024, 1, 29, 12, 34, 56, 500).getTime());
  });

  it('keeps years below 100 as they are, rather than as 19xx', () => {
    expect(XMLGregorianCalendar.parse('0050-01-01Z', XS.date).toDate().getUTCFullYear()).toBe(50);
    expect(XMLGregorianCalendar.parse('-0001-01-01Z', XS.date).toDate().getUTCFullYear()).toBe(-1);
  });

  it('raises a RangeError for a year a Date cannot hold, or a zone out of range', () => {
    expect(() => XMLGregorianCalendar.parse('300000-01-01Z', XS.date).toDate()).toThrow(RangeError);
    expect(() => XMLGregorianCalendar.parse('-300000-01-01', XS.date).toDate()).toThrow(RangeError);
    expect(() => XMLGregorianCalendar.parse('2024-01-01', XS.date).toDate('+15:00')).toThrow(RangeError);
  });
});

describe('fieldsOf', () => {
  it('gives all eight fields, for making a value like another', () => {
    const value = XMLGregorianCalendar.parse('12:00:00Z', XS.time);
    const fields: CalendarFields = fieldsOf(value);
    expect(fields).toEqual({ year: undefined, month: undefined, day: undefined, ...NOON, timezone: 0 });
    expect(new XMLGregorianCalendar(XS.time, { ...fields, hour: 13 }).toString()).toBe('13:00:00Z');
  });
});

describe('the XMLGregorianCalendar type', () => {
  it('narrows each field by the kind', () => {
    expectTypeOf<XMLGregorianCalendar<'date'>['year']>().toEqualTypeOf<number>();
    expectTypeOf<XMLGregorianCalendar<'date'>['hour']>().toEqualTypeOf<undefined>();
    expectTypeOf<XMLGregorianCalendar<'time'>['fractionalSecond']>().toEqualTypeOf<Decimal>();
    expectTypeOf<XMLGregorianCalendar<'gMonthDay'>['year']>().toEqualTypeOf<undefined>();
    expectTypeOf<XMLGregorianCalendar<'date' | 'time'>['hour']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<XMLGregorianCalendar['day']>().toEqualTypeOf<number | undefined>();
  });

  it('gives xs:dateTimeStamp a timezone always and the others one maybe', () => {
    expectTypeOf<XMLGregorianCalendar<'dateTimeStamp'>['timezone']>().toEqualTypeOf<number>();
    expectTypeOf<XMLGregorianCalendar<'dateTime'>['timezone']>().toEqualTypeOf<number | undefined>();
  });

  it('offers toDate only for kinds that name a day', () => {
    const date = XMLGregorianCalendar.parse('2024-01-01Z', XS.date);
    const time = XMLGregorianCalendar.parse('12:00:00Z', XS.time);
    // @ts-expect-error -- a date has no hour
    const hour: number = date.hour;
    expect(hour).toBeUndefined();
    expect(date.toDate()).toBeInstanceOf(Date);
    // @ts-expect-error -- a time names no day, so has no Date
    expect(() => time.toDate()).toThrow(RangeError);
  });
});

describe('XMLGregorianCalendar, found in review', () => {
  it('raises XPTY0004 for a type that is not a date or time type', () => {
    expect(codeOf(() => new XMLGregorianCalendar(XS.integer as never, {}))).toBe('XPTY0004');
  });

  it('takes a missing fraction of a second as zero', () => {
    const time = new XMLGregorianCalendar(XS.time, { hour: 1, minute: 0, second: 0 });
    expect(time.fractionalSecond.isZero()).toBe(true);
    expect(time.toString()).toBe('01:00:00');
  });

  it('gives a Date for an instant at the very end of its range, in any timezone', () => {
    const lastHour = XMLGregorianCalendar.parse('275760-09-13T00:30:00+01:00', XS.dateTime);
    expect(lastHour.toDate().getTime()).toBe(Date.UTC(275_760, 8, 12, 23, 30));
  });
});

describe('XMLGregorianCalendar.fromDate', () => {
  it('gives the instant a Date holds as a xs:dateTime in UTC, to the millisecond', () => {
    const value = XMLGregorianCalendar.fromDate(new Date('2024-02-29T23:30:00.125+01:00'));
    expect([value.xmlSchemaType, value.toString()]).toEqual([XS.dateTime, '2024-02-29T22:30:00.125Z']);
  });
});
