import { type CivilDate, DAYS_PER_WEEK, dayNumber, floorModulo, MONTHS_PER_YEAR } from '@exemplarjs/xdm/internal';

/**
 * The calendar arithmetic behind the `d`, `F`, `W` and `w` components of `format-date`: days
 * of the year, ISO weekdays (Monday 1 to Sunday 7) and ISO 8601 week numbers. A week belongs to
 * the year, or month, that holds its Thursday, so 2005-01-01, a Saturday, is in week 53 of 2004.
 */

/** How far Thursday, which decides a week's year and month, is from Monday. */
const THURSDAY_OFFSET = 3n;

/** The weekday index, from Monday as 0, of 1970-01-01, a Thursday. */
const EPOCH_WEEKDAY = 3n;

/** The weekday of a day number, from Monday as 0 to Sunday as 6. */
function weekdayIndex(days: bigint): bigint {
  return floorModulo(days + EPOCH_WEEKDAY, DAYS_PER_WEEK);
}

/** The day of the year, from 1. */
export function dayOfYear(date: CivilDate): number {
  return Number(dayNumber(date.year, date.month, date.day) - dayNumber(date.year, 1, 1)) + 1;
}

/** The ISO weekday: Monday 1 to Sunday 7. */
export function isoWeekday(date: CivilDate): number {
  return Number(weekdayIndex(dayNumber(date.year, date.month, date.day))) + 1;
}

/** The week of a period starting on a day number that holds a date whose week's Thursday is `thursday`. */
function weekFrom(periodStart: bigint, thursday: bigint): number {
  return Number((thursday - periodStart) / DAYS_PER_WEEK) + 1;
}

/** The day number of the Thursday of a date's week. */
function thursdayOf(date: CivilDate): bigint {
  const days = dayNumber(date.year, date.month, date.day);
  return days - weekdayIndex(days) + THURSDAY_OFFSET;
}

/** The ISO 8601 week of the year: week 1 holds the year's first Thursday, and earlier days are in the last week of the year before. */
export function weekOfYear(date: CivilDate): number {
  const thursday = thursdayOf(date);
  let year = date.year;
  if (thursday < dayNumber(year, 1, 1)) year--;
  else if (thursday >= dayNumber(year + 1, 1, 1)) year++;
  return weekFrom(dayNumber(year, 1, 1), thursday);
}

/**
 * The week of the month: week 1 holds the month's first Thursday, and earlier days are in the last
 * week of the month before. Later days stay in their own month, as its fifth or sixth week.
 */
export function weekOfMonth(date: CivilDate): number {
  const thursday = thursdayOf(date);
  const { year, month } = date;
  if (thursday >= dayNumber(year, month, 1)) return weekFrom(dayNumber(year, month, 1), thursday);
  const [previousYear, previousMonth] = month === 1 ? [year - 1, MONTHS_PER_YEAR] : [year, month - 1];
  return weekFrom(dayNumber(previousYear, previousMonth, 1), thursday);
}
