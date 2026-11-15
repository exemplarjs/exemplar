import { fc, test } from '@fast-check/vitest';
import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { compareCalendars, compareDurations, timelineSeconds } from '@/date-time/date-time-comparison';
import { type CalendarKind, Decimal, Duration, XMLGregorianCalendar, XS } from '@/index';

/** Minutes east of UTC of some implicit timezones. */
const UTC = 0;
const MINUS_FIVE_HOURS = -300;
const PLUS_ONE_HOUR = 60;
/** Seconds from 1970-01-01 to 1972-12-31, the reference date F&O fills in. */
const REFERENCE_DAY_SECONDS = 1095 * 86_400;

const calendar = (text: string, kind: CalendarKind): XMLGregorianCalendar => XMLGregorianCalendar.parse(text, XS[kind]);

/** Whether two values of a kind are equal, as `eq` compares them. */
function equal(a: string, b: string, kind: CalendarKind, implicitTimezone = UTC): boolean {
  return compareCalendars(calendar(a, kind), calendar(b, kind), false, implicitTimezone) === 0;
}

/** The order of two values of a kind: negative, zero or positive. */
function order(a: string, b: string, kind: CalendarKind, implicitTimezone = UTC): number {
  return Math.sign(compareCalendars(calendar(a, kind), calendar(b, kind), true, implicitTimezone));
}

describe('timelineSeconds', () => {
  it('counts seconds from 1970-01-01T00:00:00Z, exactly, with the fraction', () => {
    expect(timelineSeconds(calendar('1970-01-01T00:00:00Z', 'dateTime'), UTC).toString()).toBe('0');
    expect(timelineSeconds(calendar('1970-01-01T01:00:00.25+01:00', 'dateTime'), UTC).toString()).toBe('0.25');
    expect(timelineSeconds(calendar('1969-12-31', 'date'), UTC).toString()).toBe('-86400');
  });

  it('takes the implicit timezone for a value without one', () => {
    expect(timelineSeconds(calendar('1970-01-01T00:00:00', 'dateTime'), MINUS_FIVE_HOURS).toString()).toBe('18000');
  });

  it("puts a time on 1972-12-31, and each xs:g* value on F&O's reference date (§10.4)", () => {
    const at = (text: string, kind: CalendarKind): Decimal => timelineSeconds(calendar(text, kind), UTC);
    expect(at('00:00:00Z', 'time').toString()).toBe(String(REFERENCE_DAY_SECONDS));
    expect(at('---31Z', 'gDay')).toEqual(at('1972-12-31Z', 'date'));
    expect(at('--02-29Z', 'gMonthDay')).toEqual(at('1972-02-29Z', 'date'));
    expect(at('--07Z', 'gMonth')).toEqual(at('1972-07-01Z', 'date'));
    expect(at('2024Z', 'gYear')).toEqual(at('2024-01-01Z', 'date'));
    expect(at('2024-07Z', 'gYearMonth')).toEqual(at('2024-07-01Z', 'date'));
  });
});

describe('compareCalendars', () => {
  it('compares dates and times as instants (F&O §10.4 examples)', () => {
    expect(equal('2002-04-02T12:00:00-01:00', '2002-04-02T17:00:00+04:00', 'dateTime')).toBe(true);
    expect(equal('1999-12-31T24:00:00-05:00', '2000-01-01T00:00:00-05:00', 'dateTime')).toBe(true);
    expect(equal('2004-12-25Z', '2004-12-25+07:00', 'date')).toBe(false);
    expect(order('2004-12-25Z', '2004-12-25-05:00', 'date')).toBe(-1);
    expect(equal('08:00:00+09:00', '17:00:00-06:00', 'time')).toBe(false);
    expect(equal('21:30:00+10:30', '06:00:00-05:00', 'time')).toBe(true);
    expect(equal('24:00:00+01:00', '00:00:00+01:00', 'time')).toBe(true);
  });

  it('puts a value without a timezone in the implicit one', () => {
    expect(equal('10:00:00', '09:00:00Z', 'time', PLUS_ONE_HOUR)).toBe(true);
    expect(equal('10:00:00', '09:00:00Z', 'time', UTC)).toBe(false);
    expect(equal('2002-04-02T12:00:00', '2002-04-02T17:00:00Z', 'dateTime', MINUS_FIVE_HOURS)).toBe(true);
    expect(equal('1976', '1976-05:00', 'gYear', MINUS_FIVE_HOURS)).toBe(true);
  });

  it('compares xs:g* values for equality on their reference dates (F&O §10.4 examples)', () => {
    expect(equal('2005-12:00', '2005+12:00', 'gYear')).toBe(false);
    expect(equal('1986-02', '1986-02', 'gYearMonth')).toBe(true);
    expect(equal('--12-25-14:00', '--12-26+10:00', 'gMonthDay')).toBe(true);
    expect(equal('--12-14:00', '--12+10:00', 'gMonth')).toBe(false);
    expect(equal('---25-14:00', '---25+10:00', 'gDay')).toBe(false);
  });

  it('orders dates and times with dates and times of a type derived from the same primitive', () => {
    const stamp = calendar('2024-01-01T00:00:00Z', 'dateTimeStamp');
    expect(compareCalendars(stamp, calendar('2024-01-01T00:00:01Z', 'dateTime'), true, UTC)).toBeLessThan(0);
  });

  it('raises XPTY0004 for an order between xs:g* values', () => {
    for (const [text, kind] of [
      ['2024', 'gYear'],
      ['2024-01', 'gYearMonth'],
      ['--01-01', 'gMonthDay'],
      ['--01', 'gMonth'],
      ['---01', 'gDay'],
    ] as const) {
      expect(codeOf(() => order(text, text, kind))).toBe('XPTY0004');
    }
  });

  it('raises XPTY0004 for values of different primitive types', () => {
    const date = calendar('2024-01-01', 'date');
    const dateTime = calendar('2024-01-01T00:00:00', 'dateTime');
    expect(codeOf(() => compareCalendars(date, dateTime, false, UTC))).toBe('XPTY0004');
    expect(
      codeOf(() => compareCalendars(calendar('2024', 'gYear'), calendar('2024-01', 'gYearMonth'), false, UTC))
    ).toBe('XPTY0004');
  });
});

describe('compareDurations', () => {
  const duration = (text: string, kind: 'duration' | 'yearMonthDuration' | 'dayTimeDuration'): Duration =>
    Duration.parse(text, XS[kind]);
  const equalDurations = (a: Duration, b: Duration): boolean => compareDurations(a, b, false) === 0;

  it('compares any two durations for equality by months and seconds (F&O §8.2 examples)', () => {
    expect(equalDurations(duration('P1Y', 'duration'), duration('P365D', 'duration'))).toBe(false);
    expect(equalDurations(duration('P0Y', 'yearMonthDuration'), duration('P0D', 'dayTimeDuration'))).toBe(true);
    expect(equalDurations(duration('P1Y', 'yearMonthDuration'), duration('P365D', 'dayTimeDuration'))).toBe(false);
    expect(equalDurations(duration('P2Y', 'yearMonthDuration'), duration('P24M', 'yearMonthDuration'))).toBe(true);
    expect(equalDurations(duration('P10D', 'dayTimeDuration'), duration('PT240H', 'dayTimeDuration'))).toBe(true);
    expect(equalDurations(duration('P2Y0M0DT0H0M0S', 'duration'), duration('P24M', 'yearMonthDuration'))).toBe(true);
    expect(equalDurations(duration('P0Y0M10D', 'duration'), duration('PT240H', 'dayTimeDuration'))).toBe(true);
    expect(equalDurations(duration('P1M', 'duration'), duration('P1MT1S', 'duration'))).toBe(false);
  });

  it('orders two year-month durations by months, and two day-time durations by seconds', () => {
    expect(compareDurations(duration('P1Y', 'yearMonthDuration'), duration('P13M', 'yearMonthDuration'), true)).toBe(
      -1
    );
    expect(compareDurations(duration('P1D', 'dayTimeDuration'), duration('PT23H', 'dayTimeDuration'), true)).toBe(1);
    expect(compareDurations(duration('-PT1S', 'dayTimeDuration'), duration('-PT1S', 'dayTimeDuration'), true)).toBe(0);
  });

  it('raises XPTY0004 for an order between xs:duration values or durations of different subtypes', () => {
    const yearMonth = duration('P1M', 'yearMonthDuration');
    const dayTime = duration('P1D', 'dayTimeDuration');
    expect(codeOf(() => compareDurations(duration('P1M', 'duration'), duration('P1M', 'duration'), true))).toBe(
      'XPTY0004'
    );
    expect(codeOf(() => compareDurations(yearMonth, dayTime, true))).toBe('XPTY0004');
    expect(codeOf(() => compareDurations(dayTime, yearMonth, true))).toBe('XPTY0004');
  });
});

/** Instants within the range of a JavaScript Date, to the millisecond, with timezones. */
const instant = fc.record({
  milliseconds: fc.integer({ min: -8_000_000_000_000_000, max: 8_000_000_000_000_000 }),
  timezone: fc.integer({ min: -840, max: 840 }),
});

/** The decimal places of milliseconds as a fraction of a second, and milliseconds in a minute. */
const MILLISECOND_PLACES = 3;
const MILLISECONDS_PER_MINUTE = 60_000;

/** An instant written as a xs:dateTime in a timezone, through JavaScript's own calendar. */
function asDateTime({ milliseconds, timezone }: { milliseconds: number; timezone: number }): XMLGregorianCalendar {
  const local = new Date(milliseconds + timezone * MILLISECONDS_PER_MINUTE);
  const fraction = BigInt(local.getUTCMilliseconds());
  return new XMLGregorianCalendar(XS.dateTime, {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    fractionalSecond: Decimal.of(fraction, MILLISECOND_PLACES),
    timezone,
  });
}

test.prop([instant, instant])('orders dates and times as JavaScript orders their instants', (a, b) => {
  const first = asDateTime(a);
  const second = asDateTime(b);
  const order = compareCalendars(first, second, true, UTC);
  expect(Math.sign(order)).toBe(Math.sign(a.milliseconds - b.milliseconds));
  const milliseconds = timelineSeconds(first, UTC).multiply(Decimal.of(1000n));
  expect(milliseconds.toString()).toBe(String(a.milliseconds));
});

describe('compareCalendars, found in review', () => {
  it('says values of different types cannot be compared, even when an order was asked for', () => {
    expect(() =>
      compareCalendars(calendar('2024-01-01', 'date'), calendar('2024-01-01T00:00:00', 'dateTime'), true, UTC)
    ).toThrow(/cannot be compared/);
  });
});
