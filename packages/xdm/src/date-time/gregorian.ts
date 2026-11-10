import { XPathErrorCode, xdmError } from '@/errors';
import { Decimal } from '@/numeric/decimal';

/** Months in a year, hours in a day, minutes in an hour, seconds in a minute, and milliseconds in a second. */
export const MONTHS_PER_YEAR = 12;
export const HOURS_PER_DAY = 24;
/** Hours in half a day, as a 12-hour clock counts them. */
export const HOURS_PER_HALF_DAY = 12;
export const MINUTES_PER_HOUR = 60;
export const SECONDS_PER_MINUTE = 60;
export const MILLISECONDS_PER_SECOND = 1000;
/** Seconds in an hour and in a day. */
export const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
export const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;
/** Days in a week, as a bigint for day-number arithmetic. */
export const DAYS_PER_WEEK = 7n;

/** The last hour, minute and second of a day. */
export const LAST_HOUR = 23;
export const LAST_MINUTE = 59;
export const LAST_SECOND = 59;
/** The farthest a timezone may be from UTC, in hours and in minutes. */
const TIMEZONE_LIMIT_HOURS = 14;
export const TIMEZONE_LIMIT = TIMEZONE_LIMIT_HOURS * MINUTES_PER_HOUR;

/** Whether an offset in minutes is a timezone: whole minutes within 14 hours of UTC. */
export function isTimezone(minutes: number): boolean {
  return Number.isInteger(minutes) && Math.abs(minutes) <= TIMEZONE_LIMIT;
}

/** A minute in seconds, exact. */
export const MINUTE_IN_SECONDS: Decimal = Decimal.of(BigInt(SECONDS_PER_MINUTE));

/** A timezone offset in minutes as exact seconds. */
export function timezoneSeconds(minutes: number): Decimal {
  return Decimal.of(BigInt(minutes * SECONDS_PER_MINUTE));
}

/** The length of each month in a common year, January first, and February's in a leap year. */
// eslint-disable-next-line no-magic-numbers -- the Gregorian month lengths
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const LEAP_FEBRUARY_LENGTH = 29;
const FEBRUARY = 2;
const MARCH = 3;
/** Months from March to December, which a year counted from March puts before January. */
const MONTHS_FROM_MARCH = MONTHS_PER_YEAR - FEBRUARY;

/** The Gregorian leap-year rule: every fourth year, but not every hundredth, yet every four hundredth. */
const LEAP_YEAR_INTERVAL = 4n;
const YEARS_PER_CENTURY = 100n;

/** The days in the 400-year cycle the proleptic Gregorian calendar repeats, and the years in it. */
const DAYS_PER_ERA = 146_097n;
const YEARS_PER_ERA = 400n;
/** The days in a common year, in four of them, and in a century that does not end a 400-year cycle. */
const DAYS_PER_COMMON_YEAR = 365n;
const DAYS_PER_FOUR_COMMON_YEARS = DAYS_PER_COMMON_YEAR * LEAP_YEAR_INTERVAL;
const DAYS_PER_CENTURY = 36_524n;

/** Days before month m of a year counted from March are (153m + 2) / 5. */
const MONTHS_PER_CYCLE = 5n;
const DAYS_PER_MONTH_CYCLE = 153n;
const MONTH_START_OFFSET = 2n;

/** Days from 0000-03-01 to 1970-01-01, the epoch the day numbers count from. */
const EPOCH_SHIFT = 719_468n;

/** Whether a year is a leap year in the proleptic Gregorian calendar, where year 0 is 1 BCE and is one. */
export function isLeapYear(year: number | bigint): boolean {
  const value = BigInt(year);
  return (value % LEAP_YEAR_INTERVAL === 0n && value % YEARS_PER_CENTURY !== 0n) || value % YEARS_PER_ERA === 0n;
}

/** The days in a month of a year; with no year, as for `xs:gMonthDay`, February has 29. */
export function daysInMonth(year: number | bigint | undefined, month: number): number {
  if (month === FEBRUARY && (year === undefined || isLeapYear(year))) return LEAP_FEBRUARY_LENGTH;
  return MONTH_LENGTHS[month - 1] as number;
}

/** Division rounded toward negative infinity, as calendar arithmetic needs for years before the epoch. */
export function floorDivide(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  // Bigint division truncates, which rounds an inexact negative quotient up.
  const roundedUp = dividend % divisor !== 0n && dividend < 0n !== divisor < 0n;
  return roundedUp ? quotient - 1n : quotient;
}

/** The remainder of `floorDivide`, which takes the divisor's sign. */
export function floorModulo(dividend: bigint, divisor: bigint): bigint {
  const remainder = dividend % divisor;
  const signsDiffer = remainder < 0n !== divisor < 0n;
  return remainder !== 0n && signsDiffer ? remainder + divisor : remainder;
}

/** A year that must be a safe integer, the range exemplar's years have; FODT0001 otherwise. */
export function safeYear(year: bigint): number {
  const value = Number(year);
  if (!Number.isSafeInteger(value))
    return xdmError(XPathErrorCode.DATE_TIME_OVERFLOW, `The year ${year} is out of range`);
  return value;
}

/** A count of months, or of a duration's days, that must be a safe integer; FODT0002 otherwise. */
export function safeCount(count: bigint, unit: string): number {
  const value = Number(count);
  if (!Number.isSafeInteger(value))
    return xdmError(XPathErrorCode.DURATION_OVERFLOW, `A duration of ${count} ${unit} is out of range`);
  return value;
}

/** Whole seconds split into days, rounded down so that the rest is a time of day, and that time's hours, minutes and seconds. */
export function splitSeconds(whole: bigint): { days: bigint; hour: number; minute: number; second: number } {
  const days = floorDivide(whole, BigInt(SECONDS_PER_DAY));
  const ofDay = Number(floorModulo(whole, BigInt(SECONDS_PER_DAY)));
  return {
    days,
    hour: Math.floor(ofDay / SECONDS_PER_HOUR),
    minute: Math.floor((ofDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    second: ofDay % SECONDS_PER_MINUTE,
  };
}

// dayNumber and civilDate follow Howard Hinnant's published days_from_civil and civil_from_days.

/**
 * The day number of a date: days since 1970-01-01, negative before it, in the proleptic Gregorian
 * calendar. Counting the year from March puts the leap day last, so each 400-year era has the same
 * layout and the date needs no tables.
 *
 * ```ts
 * dayNumber(1970, 1, 1); // 0n
 * dayNumber(2000, 3, 1); // 11017n
 * ```
 */
export function dayNumber(year: number, month: number, day: number): bigint {
  const civilYear = BigInt(year);
  const marchYear = month <= FEBRUARY ? civilYear - 1n : civilYear;
  const era = floorDivide(marchYear, YEARS_PER_ERA);
  const yearOfEra = floorModulo(marchYear, YEARS_PER_ERA);
  const monthsAfterMarch = month - MARCH;
  const marchMonth = BigInt(month > FEBRUARY ? monthsAfterMarch : monthsAfterMarch + MONTHS_PER_YEAR);
  const dayOfYear = (DAYS_PER_MONTH_CYCLE * marchMonth + MONTH_START_OFFSET) / MONTHS_PER_CYCLE + BigInt(day) - 1n;
  const leapDays = yearOfEra / LEAP_YEAR_INTERVAL - yearOfEra / YEARS_PER_CENTURY;
  const dayOfEra = yearOfEra * DAYS_PER_COMMON_YEAR + leapDays + dayOfYear;
  return era * DAYS_PER_ERA + dayOfEra - EPOCH_SHIFT;
}

/** A date by year, month and day. */
export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** The date of a day number, the inverse of `dayNumber`; FODT0001 when its year is not a safe integer. */
export function civilDate(days: bigint): CivilDate {
  const shifted = days + EPOCH_SHIFT;
  const era = floorDivide(shifted, DAYS_PER_ERA);
  const dayOfEra = floorModulo(shifted, DAYS_PER_ERA);
  // Leap days left out, so that each year of the era is a common year.
  const leapDaysBefore =
    dayOfEra / DAYS_PER_FOUR_COMMON_YEARS - dayOfEra / DAYS_PER_CENTURY + dayOfEra / (DAYS_PER_ERA - 1n);
  const yearOfEra = (dayOfEra - leapDaysBefore) / DAYS_PER_COMMON_YEAR;
  const leapDays = yearOfEra / LEAP_YEAR_INTERVAL - yearOfEra / YEARS_PER_CENTURY;
  const dayOfYear = dayOfEra - (DAYS_PER_COMMON_YEAR * yearOfEra + leapDays);
  const marchMonth = Number((MONTHS_PER_CYCLE * dayOfYear + MONTH_START_OFFSET) / DAYS_PER_MONTH_CYCLE);
  const day = Number(
    dayOfYear - (DAYS_PER_MONTH_CYCLE * BigInt(marchMonth) + MONTH_START_OFFSET) / MONTHS_PER_CYCLE + 1n
  );
  const monthOfYear = marchMonth + MARCH;
  const month = marchMonth < MONTHS_FROM_MARCH ? monthOfYear : monthOfYear - MONTHS_PER_YEAR;
  const year = yearOfEra + era * YEARS_PER_ERA + (month <= FEBRUARY ? 1n : 0n);
  return { year: safeYear(year), month, day };
}
