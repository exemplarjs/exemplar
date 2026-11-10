import { describe, expect, it } from 'vitest';
import { dayOfYear, isoWeekday, weekOfMonth, weekOfYear } from '@/functions/formatting/date-components';

/** A date from its text, such as `2005-01-01`. */
function date(text: string) {
  const [year, month, day] = text.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

describe('calendar arithmetic', () => {
  it('counts days of the year and ISO weekdays', () => {
    expect([dayOfYear(date('2016-02-01')), dayOfYear(date('2016-12-31')), dayOfYear(date('2015-12-31'))]).toEqual([
      32, 366, 365,
    ]);
    expect([isoWeekday(date('2004-01-01')), isoWeekday(date('2006-01-01')), isoWeekday(date('1969-12-29'))]).toEqual([
      4, 7, 1,
    ]);
  });

  it('numbers ISO weeks of the year, at both ends of a year', () => {
    expect([
      weekOfYear(date('2005-01-01')),
      weekOfYear(date('2005-01-03')),
      weekOfYear(date('2008-12-29')),
      weekOfYear(date('2004-12-31')),
    ]).toEqual([53, 1, 1, 53]);
  });

  it('numbers weeks of the month, early days in the month before', () => {
    expect([
      weekOfMonth(date('2005-12-04')),
      weekOfMonth(date('2006-01-01')),
      weekOfMonth(date('2006-01-30')),
      weekOfMonth(date('2006-04-01')),
      weekOfMonth(date('2006-04-03')),
    ]).toEqual([1, 5, 5, 5, 1]);
  });
});
