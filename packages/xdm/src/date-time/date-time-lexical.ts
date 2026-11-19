import { ErrorFactory } from '@exemplarjs/xml/internal';
import { XPathErrorCode, xdmError } from '@/errors';
import { Decimal } from '@/numeric/decimal';
import type { CalendarKind, DurationKind } from '@/types/built-in-types';
import {
  civilDate,
  dayNumber,
  daysInMonth,
  HOURS_PER_DAY,
  isTimezone,
  LAST_HOUR,
  LAST_MINUTE,
  LAST_SECOND,
  MINUTES_PER_HOUR,
  MONTHS_PER_YEAR,
  safeCount,
  safeYear,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  TIMEZONE_LIMIT,
} from './gregorian.ts';

/** Each field of XML Schema's seven-property model, by the type its value has. */
interface FieldTypes {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** Whole seconds, 0 to 59. */
  readonly second: number;
  /** The fraction of a second, at least 0 and below 1, exact. */
  readonly fractionalSecond: Decimal;
  /** Minutes east of UTC, from -840 to 840. */
  readonly timezone: number;
}

/** The fields of a date or time value; those a type lacks, and a timezone it does not have, are absent or undefined. */
export type CalendarFields = { readonly [Field in keyof FieldTypes]?: FieldTypes[Field] | undefined };

/** A value its type cannot hold: FORG0001. */
export function invalidValue(typeName: string, reason: string): never {
  return xdmError(XPathErrorCode.INVALID_VALUE_FOR_CAST, `An xs:${typeName} ${reason}`);
}

/** The parts of the lexical forms (XML Schema 1.1 Part 2, §3.3.7 to §3.3.16), as regular expression source. */
const YEAR = String.raw`(?<year>-?(?:[1-9]\d{3,}|0\d{3}))`;
const MONTH = '(?<month>0[1-9]|1[0-2])';
const DAY = String.raw`(?<day>0[1-9]|[12]\d|3[01])`;
const TIME = String.raw`(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?<fraction>\.\d+)?`;
const TIMEZONE = String.raw`(?<timezone>Z|[+-]\d{2}:\d{2})?`;
const DATE_TIME = new RegExp(`^${YEAR}-${MONTH}-${DAY}T${TIME}${TIMEZONE}$`);

/** Each kind's lexical form, its fields in named groups. */
const LEXICAL: Readonly<Record<CalendarKind, RegExp>> = {
  dateTime: DATE_TIME,
  dateTimeStamp: DATE_TIME,
  date: new RegExp(`^${YEAR}-${MONTH}-${DAY}${TIMEZONE}$`),
  time: new RegExp(`^${TIME}${TIMEZONE}$`),
  gYearMonth: new RegExp(`^${YEAR}-${MONTH}${TIMEZONE}$`),
  gYear: new RegExp(`^${YEAR}${TIMEZONE}$`),
  gMonthDay: new RegExp(`^--${MONTH}-${DAY}${TIMEZONE}$`),
  gDay: new RegExp(`^---${DAY}${TIMEZONE}$`),
  gMonth: new RegExp(`^--${MONTH}${TIMEZONE}$`),
};

/** The named groups of a lexical form, each undefined where the kind lacks it or the text leaves it out. */
interface LexicalGroups {
  readonly year?: string;
  readonly month?: string;
  readonly day?: string;
  readonly hour?: string;
  readonly minute?: string;
  readonly second?: string;
  readonly fraction?: string;
  readonly timezone?: string;
}

/** Which fields each kind has: year, month, day, and the time of day. */
export const KIND_FIELDS: Readonly<
  Record<
    CalendarKind,
    { readonly year: boolean; readonly month: boolean; readonly day: boolean; readonly time: boolean }
  >
> = {
  dateTime: { year: true, month: true, day: true, time: true },
  dateTimeStamp: { year: true, month: true, day: true, time: true },
  date: { year: true, month: true, day: true, time: false },
  time: { year: false, month: false, day: false, time: true },
  gYearMonth: { year: true, month: true, day: false, time: false },
  gYear: { year: true, month: false, day: false, time: false },
  gMonthDay: { year: false, month: true, day: true, time: false },
  gDay: { year: false, month: false, day: true, time: false },
  gMonth: { year: false, month: true, day: false, time: false },
};

/** The hour of `24:00:00`, allowed as the end of a day. */
const END_OF_DAY_HOUR = HOURS_PER_DAY;

/** The fewest digits a year is written with, and each other field. */
const YEAR_DIGITS = 4;
const FIELD_DIGITS = 2;

/** A timezone's minutes from `Z` or `+hh:mm`, or undefined when it is out of range. */
function timezoneMinutes(text: string): number | undefined {
  if (text === 'Z') return 0;
  // The text is `+hh:mm` or `-hh:mm`.
  const [hourText = '', minuteText = ''] = text.slice(1).split(':');
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  const offset = hours * MINUTES_PER_HOUR + minutes;
  if (minutes > LAST_MINUTE || offset > TIMEZONE_LIMIT) return undefined;
  // `-00:00` is 0, not -0.
  if (text.startsWith('-') && offset !== 0) return -offset;
  return offset;
}

/** Reads a time of day; undefined for one out of range. `24:00:00` reads as hour 24, which `endOfDay` resolves. */
function timeOf(
  hourText: string,
  minuteText: string,
  secondText: string,
  fractionText: string | undefined
): Pick<CalendarFields, 'hour' | 'minute' | 'second' | 'fractionalSecond'> | undefined {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const fractionalSecond = fractionText === undefined ? Decimal.ZERO : (Decimal.parse(`0${fractionText}`) as Decimal);
  const isMidnightAtEnd = minute === 0 && second === 0 && fractionalSecond.isZero();
  const isClockTime = hour <= LAST_HOUR && minute <= LAST_MINUTE && second <= LAST_SECOND;
  const inRange = hour === END_OF_DAY_HOUR ? isMidnightAtEnd : isClockTime;
  return inRange ? { hour, minute, second, fractionalSecond } : undefined;
}

/** Fields with a time of `24:00:00` moved to midnight, the next day where the kind has a date. */
function endOfDay(fields: CalendarFields, kind: CalendarKind): CalendarFields {
  if (fields.hour !== END_OF_DAY_HOUR) return fields;
  if (!KIND_FIELDS[kind].day) return { ...fields, hour: 0 };
  const next = civilDate(dayNumber(fields.year as number, fields.month as number, fields.day as number) + 1n);
  return { ...fields, ...next, hour: 0 };
}

/**
 * The fields a date or time type's lexical form gives, such as `2024-02-29T24:00:00+01:00` as
 * `xs:dateTime`, or undefined when the text is not one. Days are checked against their month,
 * February 29 needing a leap year; `24:00:00` is midnight at the end of the day.
 */
export function parseCalendarFields(text: string, kind: CalendarKind): CalendarFields | undefined {
  const match = LEXICAL[kind].exec(text);
  if (match === null) return undefined;
  const groups = match.groups as LexicalGroups;
  const year = groups.year === undefined ? undefined : safeYear(BigInt(groups.year));
  const month = groups.month === undefined ? undefined : Number(groups.month);
  const day = groups.day === undefined ? undefined : Number(groups.day);
  if (day !== undefined && day > daysInMonth(year, month ?? 1)) return undefined;
  const time =
    groups.hour === undefined
      ? {}
      : timeOf(groups.hour, groups.minute as string, groups.second as string, groups.fraction);
  if (time === undefined) return undefined;
  const zoneText = groups.timezone;
  const timezone = zoneText === undefined ? undefined : timezoneMinutes(zoneText);
  if (zoneText !== undefined && timezone === undefined) return undefined;
  const fields: CalendarFields = { year, month, day, ...time, timezone };
  return endOfDay(fields, kind);
}

/** A number, or its digits, written with at least two digits. */
export function twoDigits(value: number | bigint | string): string {
  return String(value).padStart(FIELD_DIGITS, '0');
}

/** A year written with at least four digits, and a minus sign before the year 0. */
function yearText(year: number): string {
  return `${year < 0 ? '-' : ''}${String(Math.abs(year)).padStart(YEAR_DIGITS, '0')}`;
}

/** A timezone as `Z` for UTC, or `+hh:mm` and `-hh:mm`; empty for none. */
export function timezoneText(timezone: number | undefined): string {
  if (timezone === undefined) return '';
  if (timezone === 0) return 'Z';
  const offset = Math.abs(timezone);
  return `${timezone < 0 ? '-' : '+'}${twoDigits(Math.floor(offset / MINUTES_PER_HOUR))}:${twoDigits(offset % MINUTES_PER_HOUR)}`;
}

/** Seconds with their fraction, the fraction without trailing zeros: `05`, `05.25`. */
function secondsText(second: number, fraction: Decimal): string {
  return fraction.isZero() ? twoDigits(second) : `${twoDigits(second)}${fraction.toString().slice(1)}`;
}

/** A date as `yyyy-mm-dd`. */
function dateText(fields: CalendarFields): string {
  return `${yearText(fields.year as number)}-${twoDigits(fields.month as number)}-${twoDigits(fields.day as number)}`;
}

/** A time of day as `hh:mm:ss`, with any fraction of a second. */
function timeText(fields: CalendarFields): string {
  const seconds = secondsText(fields.second as number, fields.fractionalSecond as Decimal);
  return `${twoDigits(fields.hour as number)}:${twoDigits(fields.minute as number)}:${seconds}`;
}

/** The canonical lexical form of a date or time value, as casting it to `xs:string` writes it (F&O §19.1.2.2). */
export function formatCalendar(kind: CalendarKind, fields: CalendarFields): string {
  const zone = timezoneText(fields.timezone);
  switch (kind) {
    case 'dateTime':
    case 'dateTimeStamp': {
      return `${dateText(fields)}T${timeText(fields)}${zone}`;
    }
    case 'date': {
      return `${dateText(fields)}${zone}`;
    }
    case 'time': {
      return `${timeText(fields)}${zone}`;
    }
    case 'gYearMonth': {
      return `${yearText(fields.year as number)}-${twoDigits(fields.month as number)}${zone}`;
    }
    case 'gYear': {
      return `${yearText(fields.year as number)}${zone}`;
    }
    case 'gMonthDay': {
      return `--${twoDigits(fields.month as number)}-${twoDigits(fields.day as number)}${zone}`;
    }
    case 'gDay': {
      return `---${twoDigits(fields.day as number)}${zone}`;
    }
    default: {
      return `--${twoDigits(fields.month as number)}${zone}`;
    }
  }
}

/** The parts of `xs:duration`'s lexical form (XML Schema 1.1 Part 2, §3.3.6.2), as regular expression source; seconds need digits on both sides of a point, as the spec's expression says. */
const DURATION_DATE = String.raw`(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?`;
const DURATION_TIME = String.raw`(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?`;

/** The lexical form of `xs:duration`: a sign, then years, months and days, then a time. */
const DURATION = new RegExp(`^(-)?P${DURATION_DATE}${DURATION_TIME}$`);

/** A duration's value: whole months and exact seconds, both with the duration's sign. */
export interface DurationParts {
  readonly months: number;
  readonly seconds: Decimal;
}

/** Which parts each duration kind's lexical form may have. */
const DURATION_PARTS: Readonly<Record<DurationKind, { readonly months: boolean; readonly seconds: boolean }>> = {
  duration: { months: true, seconds: true },
  yearMonthDuration: { months: true, seconds: false },
  dayTimeDuration: { months: false, seconds: true },
};

/**
 * A duration's months and seconds from its lexical form, such as `-P1Y2MT3.5S`, or undefined when
 * the text is not one of the kind: at least one part, a `T` only before a time part, and for
 * `xs:yearMonthDuration` and `xs:dayTimeDuration` only their own parts.
 */
export function parseDurationParts(text: string, kind: DurationKind): DurationParts | undefined {
  const match = DURATION.exec(text);
  if (match === null || text.endsWith('T') || text.endsWith('P')) return undefined;
  const [, minus, years, months, days, hours, minutes, seconds] = match;
  const allowed = DURATION_PARTS[kind];
  const hasMonths = years !== undefined || months !== undefined;
  const hasSeconds = days !== undefined || hours !== undefined || minutes !== undefined || seconds !== undefined;
  if ((hasMonths && !allowed.months) || (hasSeconds && !allowed.seconds)) return undefined;
  const wholeSeconds =
    BigInt(days ?? 0) * BigInt(SECONDS_PER_DAY) +
    BigInt(hours ?? 0) * BigInt(SECONDS_PER_HOUR) +
    BigInt(minutes ?? 0) * BigInt(SECONDS_PER_MINUTE);
  const total = Decimal.of(wholeSeconds).add(Decimal.parse(seconds ?? '0') as Decimal);
  const monthCount = safeCount(BigInt(years ?? 0) * BigInt(MONTHS_PER_YEAR) + BigInt(months ?? 0), 'months');
  // A zero duration has no sign, so `-P0D` is `PT0S`.
  const isZero = monthCount === 0 && total.isZero();
  if (minus === undefined || isZero) return { months: monthCount, seconds: total };
  // Negating 0 would give -0.
  const negatedMonths = monthCount === 0 ? 0 : -monthCount;
  return { months: negatedMonths, seconds: total.negate() };
}

/** The machine's offset from UTC now, in minutes east, the implicit timezone when none is given. */
export function localTimezone(): number {
  // getTimezoneOffset counts minutes west of UTC; UTC itself is 0, not -0.
  const west = new Date().getTimezoneOffset();
  return west === 0 ? 0 : -west;
}

/**
 * A timezone given as minutes or as an offset such as `+01:00`, `-05:00` or `Z`, the machine's
 * when none is given; RangeError for one out of range.
 */
export function timezoneFromOption(zone: number | string | undefined): number {
  if (zone === undefined) return localTimezone();
  let minutes: number | undefined;
  if (typeof zone === 'number') minutes = zone;
  else if (/^(?:Z|[+-]\d{2}:\d{2})$/.test(zone)) minutes = timezoneMinutes(zone);
  if (minutes === undefined || !isTimezone(minutes))
    throw ErrorFactory.create(RangeError, `${String(zone)} is not a timezone from -14:00 to +14:00`);
  // -0 is equal to 0, so this gives 0 for either.
  return minutes === 0 ? 0 : minutes;
}
