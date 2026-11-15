import { notComparable } from '@/errors';
import { compareBigints, Decimal } from '@/numeric/decimal';
import { type AtomicType, XS } from '@/types/built-in-types';
import type { XMLGregorianCalendar } from './calendar.ts';
import type { Duration } from './duration.ts';
import { dayNumber, SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, timezoneSeconds } from './gregorian.ts';

/** The date F&O fills in for the fields a time or a `xs:g*` value lacks before comparing it: 1972-12-31, in a leap year. */
const REFERENCE_YEAR = 1972;
const REFERENCE_MONTH = 12;
const REFERENCE_DAY = 31;

/**
 * The date a value names, the missing fields filled as F&O's comparisons fill them: a time on
 * 1972-12-31, a `xs:gDay` in December 1972, a `xs:gMonthDay` in 1972, and a `xs:gYear`,
 * `xs:gYearMonth` or `xs:gMonth` on the first of its month.
 */
function referenceDate(value: XMLGregorianCalendar): { year: number; month: number; day: number } {
  const noYear = value.year === undefined;
  const noYearOrMonth = noYear && value.month === undefined;
  const defaultMonth = noYear ? REFERENCE_MONTH : 1;
  const defaultDay = noYearOrMonth ? REFERENCE_DAY : 1;
  return { year: value.year ?? REFERENCE_YEAR, month: value.month ?? defaultMonth, day: value.day ?? defaultDay };
}

/** A value's local seconds since 1970-01-01T00:00:00, exact, the fields it lacks filled from the reference date. */
export function localSeconds(value: XMLGregorianCalendar): Decimal {
  const { year, month, day } = referenceDate(value);
  const clock = (value.hour ?? 0) * SECONDS_PER_HOUR + (value.minute ?? 0) * SECONDS_PER_MINUTE + (value.second ?? 0);
  const whole = dayNumber(year, month, day) * BigInt(SECONDS_PER_DAY) + BigInt(clock);
  return value.fractionalSecond === undefined ? Decimal.of(whole) : Decimal.of(whole).add(value.fractionalSecond);
}

/**
 * A value's place on the timeline, in seconds since 1970-01-01T00:00:00Z, exact: its local
 * seconds less its timezone, or the implicit one when it has none. Two values compare as their
 * timeline seconds do (F&O §10.4).
 */
export function timelineSeconds(value: XMLGregorianCalendar, implicitTimezone: number): Decimal {
  const timezone = value.timezone ?? implicitTimezone;
  return localSeconds(value).subtract(timezoneSeconds(timezone));
}

/** The types whose values have an order, and that subtract into durations: dates and times; the `xs:g*` types compare for equality only. */
export const ORDERED_CALENDAR_TYPES: ReadonlySet<AtomicType> = new Set([XS.dateTime, XS.date, XS.time]);

/**
 * Compares two date or time values of one primitive type, as the value comparisons do: negative,
 * zero or positive by their timeline seconds, a value without a timezone taking the implicit one.
 * XPTY0004 for different types, or for an order between `xs:g*` values.
 */
export function compareCalendars(
  a: XMLGregorianCalendar,
  b: XMLGregorianCalendar,
  ordered: boolean,
  implicitTimezone: number
): number {
  const primitive = a.xmlSchemaType.primitive;
  if (primitive !== b.xmlSchemaType.primitive) return notComparable(a.xmlSchemaType, b.xmlSchemaType);
  if (ordered && !ORDERED_CALENDAR_TYPES.has(primitive))
    return notComparable(a.xmlSchemaType, b.xmlSchemaType, 'ordered');
  return timelineSeconds(a, implicitTimezone).compare(timelineSeconds(b, implicitTimezone));
}

/**
 * Compares two durations: any two for equality, which holds when both their months and their
 * seconds are equal; an order only between two `xs:yearMonthDuration` values or two
 * `xs:dayTimeDuration` values, else XPTY0004.
 */
export function compareDurations(a: Duration, b: Duration, ordered: boolean): number {
  if (!ordered) {
    const equal = a.totalMonths === b.totalMonths && a.totalSeconds.compare(b.totalSeconds) === 0;
    return equal ? 0 : 1;
  }
  if (a.kind === 'yearMonthDuration' && b.kind === 'yearMonthDuration')
    return compareBigints(BigInt(a.totalMonths), BigInt(b.totalMonths));
  if (a.kind === 'dayTimeDuration' && b.kind === 'dayTimeDuration') return a.totalSeconds.compare(b.totalSeconds);
  return notComparable(a.xmlSchemaType, b.xmlSchemaType, 'ordered');
}
