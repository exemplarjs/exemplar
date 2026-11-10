import { fc, test } from '@fast-check/vitest';
import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { civilDate, dayNumber, daysInMonth, floorDivide, isLeapYear, isTimezone } from '@/date-time/gregorian';

const FEBRUARY = 2;
const APRIL = 4;

/** Milliseconds in a day, for checking day numbers against JavaScript's own calendar. */
const MILLISECONDS_PER_DAY = 86_400_000;

describe('isLeapYear', () => {
  it('follows the Gregorian rule: every fourth year, but not centuries unless divisible by 400', () => {
    expect([2024, 2023, 1900, 2000, 2100].map((year) => isLeapYear(year))).toEqual([true, false, false, true, false]);
  });

  it('counts year 0, which is 1 BCE, as a leap year, and handles years before it and bigints', () => {
    expect([isLeapYear(0), isLeapYear(-1), isLeapYear(-4), isLeapYear(-100)]).toEqual([true, false, true, false]);
    expect(isLeapYear(400n * 10n ** 20n)).toBe(true);
  });
});

describe('daysInMonth', () => {
  it('gives each month its length, February by the year', () => {
    expect([daysInMonth(2023, 1), daysInMonth(2023, APRIL), daysInMonth(2023, FEBRUARY)]).toEqual([31, 30, 28]);
    expect([daysInMonth(2024, FEBRUARY), daysInMonth(2000n, FEBRUARY)]).toEqual([29, 29]);
  });

  it('gives February 29 days when there is no year, as for xs:gMonthDay', () => {
    expect(daysInMonth(undefined, FEBRUARY)).toBe(29);
    expect(daysInMonth(undefined, 12)).toBe(31);
  });
});

describe('floorDivide', () => {
  it('rounds toward negative infinity for every combination of signs', () => {
    expect([floorDivide(7n, 2n), floorDivide(-7n, 2n), floorDivide(7n, -2n), floorDivide(-7n, -2n)]).toEqual([
      3n,
      -4n,
      -4n,
      3n,
    ]);
  });

  it('gives the exact quotient when there is no remainder', () => {
    expect([floorDivide(-6n, 2n), floorDivide(6n, -3n), floorDivide(0n, -5n)]).toEqual([-3n, -2n, 0n]);
  });
});

describe('dayNumber and civilDate', () => {
  it('count days from 1970-01-01', () => {
    expect(dayNumber(1970, 1, 1)).toBe(0n);
    expect(dayNumber(2000, 3, 1)).toBe(11_017n);
    expect(dayNumber(1969, 12, 31)).toBe(-1n);
    expect(civilDate(0n)).toEqual({ year: 1970, month: 1, day: 1 });
    expect(civilDate(-1n)).toEqual({ year: 1969, month: 12, day: 31 });
  });

  it('place the leap day between February 28 and March 1', () => {
    expect(dayNumber(2024, 3, 1) - dayNumber(2024, 2, 28)).toBe(2n);
    expect(civilDate(dayNumber(2024, 2, 28) + 1n)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('reach years before the common era and far beyond 9999', () => {
    expect(civilDate(dayNumber(0, 1, 1) - 1n)).toEqual({ year: -1, month: 12, day: 31 });
    // Year 0 is a leap year, so it has 366 days.
    expect(dayNumber(1, 1, 1) - dayNumber(0, 1, 1)).toBe(366n);
    expect(civilDate(dayNumber(123_456_789, 7, 4))).toEqual({ year: 123_456_789, month: 7, day: 4 });
  });
});

describe('civilDate', () => {
  it('raises FODT0001 for a year that is not a safe integer', () => {
    expect(codeOf(() => civilDate(10n ** 20n))).toBe('FODT0001');
  });
});

describe('isTimezone', () => {
  it('accepts whole minutes within 14 hours of UTC', () => {
    expect([
      isTimezone(0),
      isTimezone(-840),
      isTimezone(840),
      isTimezone(841),
      isTimezone(-841),
      isTimezone(1.5),
    ]).toEqual([true, true, true, false, false, false]);
  });
});

/** Any valid date, years well beyond those JavaScript's Date holds. */
const anyDate = fc
  .record({
    year: fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
  })
  .map(({ year, month, day }) => ({ year, month, day: Math.min(day, daysInMonth(year, month)) }));

test.prop([anyDate])('civilDate gives back the date dayNumber was given', (date) => {
  expect(civilDate(dayNumber(date.year, date.month, date.day))).toEqual(date);
});

test.prop([fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n })])(
  'dayNumber gives back the day civilDate was given',
  (days) => {
    const date = civilDate(days);
    expect(dayNumber(date.year, date.month, date.day)).toBe(days);
  }
);

test.prop([fc.integer({ min: -100_000_000, max: 100_000_000 })])('day numbers agree with JavaScript dates', (days) => {
  const date = new Date(days * MILLISECONDS_PER_DAY);
  expect(civilDate(BigInt(days))).toEqual({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
});
