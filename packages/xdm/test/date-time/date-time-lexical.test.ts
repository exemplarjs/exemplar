import { fc, test } from '@fast-check/vitest';
import { codeOf } from '@test/helpers/values';
import { describe, expect, it, vi } from 'vitest';
import {
  type CalendarFields,
  formatCalendar,
  KIND_FIELDS,
  localTimezone,
  parseCalendarFields,
  parseDurationParts,
  timezoneFromOption,
  timezoneText,
} from '@/date-time/date-time-lexical';
import { daysInMonth, TIMEZONE_LIMIT } from '@/date-time/gregorian';
import { type CalendarKind, Decimal } from '@/index';

const ZERO = Decimal.of(0n);
/** A fraction of a second from its digits after the point, such as `'5'` for 0.5. */
const fraction = (digits: string): Decimal => Decimal.parse(`0.${digits}`) as Decimal;
/** The largest year exemplar holds. */
const LAST_YEAR = Number.MAX_SAFE_INTEGER;

/** A date and time's fields, the seconds' fraction zero unless given. */
function dateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  extra: CalendarFields = {}
): CalendarFields {
  return { year, month, day, hour, minute, second, fractionalSecond: ZERO, timezone: undefined, ...extra };
}

describe('parseCalendarFields', () => {
  it('reads each of the nine kinds', () => {
    expect(parseCalendarFields('2024-02-29T12:30:05.25+01:00', 'dateTime')).toEqual(
      dateTime(2024, 2, 29, 12, 30, 5, { fractionalSecond: fraction('25'), timezone: 60 })
    );
    expect(parseCalendarFields('2024-02-29T12:30:05Z', 'dateTimeStamp')?.timezone).toBe(0);
    expect(parseCalendarFields('2024-02-29-05:00', 'date')).toEqual({ year: 2024, month: 2, day: 29, timezone: -300 });
    expect(parseCalendarFields('23:59:59', 'time')).toEqual({
      hour: 23,
      minute: 59,
      second: 59,
      fractionalSecond: ZERO,
      timezone: undefined,
    });
    expect(parseCalendarFields('2024-07', 'gYearMonth')).toEqual({ year: 2024, month: 7, timezone: undefined });
    expect(parseCalendarFields('2024Z', 'gYear')).toEqual({ year: 2024, timezone: 0 });
    expect(parseCalendarFields('--07-04', 'gMonthDay')).toEqual({ month: 7, day: 4, timezone: undefined });
    expect(parseCalendarFields('---04', 'gDay')).toEqual({ day: 4, timezone: undefined });
    expect(parseCalendarFields('--07', 'gMonth')).toEqual({ month: 7, timezone: undefined });
  });

  it('reads year 0000, a minus zero year as year 0, years before the common era and beyond 9999 (XSD 1.1 §3.3.7)', () => {
    expect(parseCalendarFields('0000-01-01', 'date')?.year).toBe(0);
    // Object.is tells 0 from -0.
    expect(Object.is(parseCalendarFields('-0000', 'gYear')?.year, 0)).toBe(true);
    expect(parseCalendarFields('-0044-03-15', 'date')?.year).toBe(-44);
    expect(parseCalendarFields('123456-01-01', 'date')?.year).toBe(123_456);
  });

  it('refuses years with too few digits or leading zeros beyond four', () => {
    expect(parseCalendarFields('999-01-01', 'date')).toBeUndefined();
    expect(parseCalendarFields('02024-01-01', 'date')).toBeUndefined();
  });

  it('raises FODT0001 for a year beyond the safe integers', () => {
    expect(codeOf(() => parseCalendarFields('9007199254740993-01-01', 'date'))).toBe('FODT0001');
  });

  it('allows February 29 only in leap years, but always in a gMonthDay', () => {
    expect(parseCalendarFields('2023-02-29', 'date')).toBeUndefined();
    expect(parseCalendarFields('2000-02-29', 'date')?.day).toBe(29);
    expect(parseCalendarFields('1900-02-29', 'date')).toBeUndefined();
    expect(parseCalendarFields('--02-29', 'gMonthDay')?.day).toBe(29);
    expect(parseCalendarFields('--02-30', 'gMonthDay')).toBeUndefined();
    expect(parseCalendarFields('--04-31', 'gMonthDay')).toBeUndefined();
    expect(parseCalendarFields('---31', 'gDay')?.day).toBe(31);
  });

  it('refuses times out of range', () => {
    for (const text of ['25:00:00', '23:60:00', '23:59:60', '24:00:01', '24:01:00', '24:00:00.5']) {
      expect(parseCalendarFields(text, 'time')).toBeUndefined();
    }
  });

  it('reads 24:00:00 as midnight, at the start of the next day where there is a date', () => {
    expect(parseCalendarFields('24:00:00', 'time')).toEqual({
      hour: 0,
      minute: 0,
      second: 0,
      fractionalSecond: ZERO,
      timezone: undefined,
    });
    expect(parseCalendarFields('24:00:00.000', 'time')?.hour).toBe(0);
    expect(parseCalendarFields('1999-12-31T24:00:00Z', 'dateTime')).toEqual(
      dateTime(2000, 1, 1, 0, 0, 0, { timezone: 0 })
    );
    expect(parseCalendarFields('2024-02-28T24:00:00', 'dateTime')).toEqual(dateTime(2024, 2, 29, 0, 0, 0));
  });

  it('raises FODT0001 when 24:00:00 would roll past the last year', () => {
    expect(codeOf(() => parseCalendarFields(`${LAST_YEAR}-12-31T24:00:00`, 'dateTime'))).toBe('FODT0001');
  });

  it('reads timezones up to 14 hours from UTC', () => {
    expect(parseCalendarFields('12:00:00+14:00', 'time')?.timezone).toBe(TIMEZONE_LIMIT);
    expect(parseCalendarFields('12:00:00-14:00', 'time')?.timezone).toBe(-TIMEZONE_LIMIT);
    expect(parseCalendarFields('12:00:00+05:30', 'time')?.timezone).toBe(330);
    for (const zone of ['+14:01', '+15:00', '+13:60', '+1:00', 'z']) {
      expect(parseCalendarFields(`12:00:00${zone}`, 'time')).toBeUndefined();
    }
  });

  it('refuses text of another form', () => {
    for (const [text, kind] of [
      ['2024-1-01', 'date'],
      ['2024-01-01T00:00', 'dateTime'],
      ['2024-01-01T00:00:00.', 'dateTime'],
      [' 2024-01-01', 'date'],
      ['--13', 'gMonth'],
      ['---32', 'gDay'],
      ['2024-00', 'gYearMonth'],
    ] as const) {
      expect(parseCalendarFields(text, kind)).toBeUndefined();
    }
  });
});

describe('formatCalendar', () => {
  it('writes each kind canonically, a fraction without trailing zeros (F&O §19.1.2.2)', () => {
    const fields = dateTime(2024, 2, 9, 7, 5, 3, { fractionalSecond: Decimal.of(500n, 3), timezone: 60 });
    const written = (Object.keys(KIND_FIELDS) as CalendarKind[]).map((kind) => formatCalendar(kind, fields));
    expect(written).toEqual([
      '2024-02-09T07:05:03.5+01:00',
      '2024-02-09T07:05:03.5+01:00',
      '2024-02-09+01:00',
      '07:05:03.5+01:00',
      '2024-02+01:00',
      '2024+01:00',
      '--02-09+01:00',
      '---09+01:00',
      '--02+01:00',
    ]);
  });

  it('writes years with at least four digits and a minus before the common era', () => {
    expect(formatCalendar('gYear', { year: 0 })).toBe('0000');
    expect(formatCalendar('gYear', { year: -1 })).toBe('-0001');
    expect(formatCalendar('gYear', { year: 12_345 })).toBe('12345');
    expect(formatCalendar('time', { hour: 0, minute: 0, second: 0, fractionalSecond: ZERO })).toBe('00:00:00');
  });
});

describe('timezoneText', () => {
  it('writes UTC as Z and other offsets as hours and minutes', () => {
    expect([
      timezoneText(undefined),
      timezoneText(0),
      timezoneText(-0),
      timezoneText(-330),
      timezoneText(TIMEZONE_LIMIT),
    ]).toEqual(['', 'Z', 'Z', '-05:30', '+14:00']);
  });
});

describe('parseDurationParts', () => {
  it('reads months and seconds, both with the sign', () => {
    expect(parseDurationParts('P1Y2M3DT4H5M6.5S', 'duration')).toEqual({
      months: 14,
      seconds: Decimal.parse('273906.5'),
    });
    expect(parseDurationParts('-P1Y2M3DT4H5M6.5S', 'duration')).toEqual({
      months: -14,
      seconds: Decimal.parse('-273906.5'),
    });
    expect(parseDurationParts('-PT1S', 'duration')).toEqual({ months: 0, seconds: Decimal.of(-1n) });
    expect(parseDurationParts('-P1M', 'duration')).toEqual({ months: -1, seconds: ZERO });
  });

  it('reads seconds only with digits on both sides of a point, as times do', () => {
    expect(parseDurationParts('PT1.5S', 'dayTimeDuration')?.seconds).toEqual(Decimal.parse('1.5'));
    expect(parseDurationParts('PT.5S', 'dayTimeDuration')).toBeUndefined();
    expect(parseDurationParts('PT1.S', 'dayTimeDuration')).toBeUndefined();
    expect(parseDurationParts('PT10M30.S', 'duration')).toBeUndefined();
  });

  it('gives a zero duration no sign', () => {
    const zero = parseDurationParts('-P0D', 'duration');
    expect(Object.is(zero?.months, 0)).toBe(true);
    expect(zero?.seconds.sign()).toBe(0);
    expect(Object.is(parseDurationParts('-P0M', 'yearMonthDuration')?.months, 0)).toBe(true);
  });

  it('needs at least one part, and a T only before a time part', () => {
    for (const text of ['P', '-P', 'PT', 'P1DT', 'P1YT', 'P1H', 'PT1D', '1Y', 'P-1Y', 'P1.5Y', 'PT1HS']) {
      expect(parseDurationParts(text, 'duration')).toBeUndefined();
    }
  });

  it('keeps each subtype to its own parts', () => {
    expect(parseDurationParts('P1Y2M', 'yearMonthDuration')?.months).toBe(14);
    expect(parseDurationParts('P1D', 'yearMonthDuration')).toBeUndefined();
    expect(parseDurationParts('P1Y', 'dayTimeDuration')).toBeUndefined();
    expect(parseDurationParts('P1DT1H', 'dayTimeDuration')?.seconds).toEqual(Decimal.of(90_000n));
  });

  it('raises FODT0002 for more months than the safe integers hold', () => {
    expect(codeOf(() => parseDurationParts('P900719925474100Y', 'yearMonthDuration'))).toBe('FODT0002');
  });
});

describe('localTimezone', () => {
  it("gives the machine's offset in minutes east of UTC, never negative zero", () => {
    // Whatever zone the machine is in, both a zone west of UTC and UTC itself are checked.
    const offsets = vi.spyOn(Date.prototype, 'getTimezoneOffset');
    try {
      offsets.mockReturnValue(300);
      expect(localTimezone()).toBe(-300);
      offsets.mockReturnValue(0);
      expect(Object.is(localTimezone(), 0)).toBe(true);
    } finally {
      offsets.mockRestore();
    }
  });
});

describe('timezoneFromOption', () => {
  it("gives the machine's offset when no timezone is given", () => {
    expect(timezoneFromOption(undefined)).toBe(localTimezone());
  });

  it('takes minutes, or an offset written as in a lexical form', () => {
    expect([
      timezoneFromOption(60),
      timezoneFromOption('+01:00'),
      timezoneFromOption('-05:30'),
      timezoneFromOption('Z'),
    ]).toEqual([60, 60, -330, 0]);
    expect([timezoneFromOption('+14:00'), timezoneFromOption(-TIMEZONE_LIMIT)]).toEqual([
      TIMEZONE_LIMIT,
      -TIMEZONE_LIMIT,
    ]);
  });

  it('raises a RangeError for a timezone that is not whole minutes within 14 hours of UTC', () => {
    for (const zone of [TIMEZONE_LIMIT + 1, 1.5, Number.NaN, '+15:00', '+01:60', '01:00', 'UTC', '+1:00']) {
      expect(() => timezoneFromOption(zone)).toThrow(RangeError);
    }
  });
});

/** Random fields for a kind, valid by construction. */
function fieldsFor(kind: CalendarKind): fc.Arbitrary<CalendarFields> {
  const has = KIND_FIELDS[kind];
  return fc
    .record({
      year: fc.integer({ min: -999_999, max: 999_999 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 31 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
      fractionDigits: fc.bigInt({ min: 0n, max: 999_999n }),
      timezone:
        kind === 'dateTimeStamp'
          ? fc.integer({ min: -840, max: 840 })
          : fc.option(fc.integer({ min: -840, max: 840 }), { nil: undefined }),
    })
    .map((random) => ({
      ...(has.year && { year: random.year }),
      ...(has.month && { month: random.month }),
      ...(has.day && {
        day: Math.min(random.day, daysInMonth(has.year ? random.year : undefined, has.month ? random.month : 1)),
      }),
      ...(has.time && {
        hour: random.hour,
        minute: random.minute,
        second: random.second,
        fractionalSecond: Decimal.of(random.fractionDigits, 6),
      }),
      // Adding zero keeps -0 out, which reads back as 0.
      timezone: random.timezone === undefined ? undefined : random.timezone + 0,
    }));
}

const anyKindAndFields = fc
  .constantFrom(...(Object.keys(KIND_FIELDS) as CalendarKind[]))
  .chain((kind) => fieldsFor(kind).map((fields) => ({ kind, fields })));

test.prop([anyKindAndFields])('reads back the fields of every kind it writes', ({ kind, fields }) => {
  expect(parseCalendarFields(formatCalendar(kind, fields), kind)).toEqual(fields);
});
