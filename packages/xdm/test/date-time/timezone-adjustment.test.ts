import { describe, expect, it } from 'vitest';
import { type CalendarKind, XMLGregorianCalendar, XS } from '@/index';
import { adjustToTimezone } from '@/internal';

/** Minutes east of UTC of some timezones. */
const MINUS_FIVE_HOURS = -300;
const MINUS_TEN_HOURS = -600;
const PLUS_TEN_HOURS = 600;

/** A value adjusted to a timezone, as its type and canonical text. */
function adjust(text: string, kind: CalendarKind, timezone: number | undefined): string {
  const adjusted = adjustToTimezone(XMLGregorianCalendar.parse(text, XS[kind]), timezone);
  return `${adjusted.xmlSchemaType.toString()} ${adjusted.toString()}`;
}

describe('adjustToTimezone (F&O §10.7 examples, implicit timezone -05:00)', () => {
  it('moves a date and time with a timezone to the same instant in another', () => {
    expect(adjust('2002-03-07T10:00:00-07:00', 'dateTime', PLUS_TEN_HOURS)).toBe(
      'xs:dateTime 2002-03-08T03:00:00+10:00'
    );
    expect(adjust('2002-03-07T10:00:00-07:00', 'dateTime', MINUS_FIVE_HOURS)).toBe(
      'xs:dateTime 2002-03-07T12:00:00-05:00'
    );
  });

  it('gives a value without a timezone the new one, its fields unchanged', () => {
    expect(adjust('2002-03-07T10:00:00', 'dateTime', MINUS_FIVE_HOURS)).toBe('xs:dateTime 2002-03-07T10:00:00-05:00');
    expect(adjust('2002-03-07T10:00:00', 'dateTime', PLUS_TEN_HOURS)).toBe('xs:dateTime 2002-03-07T10:00:00+10:00');
  });

  it('takes the timezone away, its fields unchanged, when there is none to adjust to', () => {
    expect(adjust('2002-03-07T10:00:00', 'dateTime', undefined)).toBe('xs:dateTime 2002-03-07T10:00:00');
    expect(adjust('2002-03-07T10:00:00-07:00', 'dateTime', undefined)).toBe('xs:dateTime 2002-03-07T10:00:00');
  });

  it('moves a date as its midnight moves', () => {
    expect(adjust('2002-03-07-07:00', 'date', MINUS_FIVE_HOURS)).toBe('xs:date 2002-03-07-05:00');
    expect(adjust('2002-03-07-07:00', 'date', MINUS_TEN_HOURS)).toBe('xs:date 2002-03-06-10:00');
    expect(adjust('2002-03-07', 'date', MINUS_TEN_HOURS)).toBe('xs:date 2002-03-07-10:00');
    expect(adjust('2002-03-07-07:00', 'date', undefined)).toBe('xs:date 2002-03-07');
  });

  it('moves a time around the clock', () => {
    expect(adjust('10:00:00', 'time', MINUS_FIVE_HOURS)).toBe('xs:time 10:00:00-05:00');
    expect(adjust('10:00:00-07:00', 'time', MINUS_FIVE_HOURS)).toBe('xs:time 12:00:00-05:00');
    expect(adjust('10:00:00-07:00', 'time', PLUS_TEN_HOURS)).toBe('xs:time 03:00:00+10:00');
    expect(adjust('10:00:00-07:00', 'time', undefined)).toBe('xs:time 10:00:00');
  });

  it('makes a xs:dateTimeStamp a xs:dateTime, the type F&O declares, with a timezone or without', () => {
    expect(adjust('2024-01-01T00:00:00Z', 'dateTimeStamp', MINUS_FIVE_HOURS)).toBe(
      'xs:dateTime 2023-12-31T19:00:00-05:00'
    );
    expect(adjust('2024-01-01T00:00:00Z', 'dateTimeStamp', undefined)).toBe('xs:dateTime 2024-01-01T00:00:00');
  });

  it('keeps the fraction of a second', () => {
    expect(adjust('2024-01-01T00:00:00.125Z', 'dateTime', 0)).toBe('xs:dateTime 2024-01-01T00:00:00.125Z');
  });
});
