import { describe, expect, it } from 'vitest';
import { errorCode, evaluate } from '../../helpers/evaluate.ts';

describe('the components of durations (F&O §8.2 examples)', () => {
  it('give years and months with the duration sign, carried over from extra months', () => {
    expect(
      evaluate(
        'years-from-duration(xs:yearMonthDuration("P20Y15M")), years-from-duration(xs:yearMonthDuration("-P15M")), years-from-duration(xs:dayTimeDuration("-P2DT15H"))'
      )
    ).toEqual(['xs:integer 21', 'xs:integer -1', 'xs:integer 0']);
    expect(
      evaluate(
        'months-from-duration(xs:yearMonthDuration("P20Y15M")), months-from-duration(xs:yearMonthDuration("-P20Y18M")), months-from-duration(xs:dayTimeDuration("-P2DT15H0M0S"))'
      )
    ).toEqual(['xs:integer 3', 'xs:integer -6', 'xs:integer 0']);
  });

  it('give days, hours and minutes with the duration sign, carried over from extra hours', () => {
    expect(
      evaluate(
        'days-from-duration(xs:dayTimeDuration("P3DT10H")), days-from-duration(xs:dayTimeDuration("P3DT55H")), days-from-duration(xs:yearMonthDuration("P3Y5M"))'
      )
    ).toEqual(['xs:integer 3', 'xs:integer 5', 'xs:integer 0']);
    expect(
      evaluate(
        'hours-from-duration(xs:dayTimeDuration("P3DT10H")), hours-from-duration(xs:dayTimeDuration("P3DT12H32M12S")), hours-from-duration(xs:dayTimeDuration("PT123H")), hours-from-duration(xs:dayTimeDuration("-P3DT10H"))'
      )
    ).toEqual(['xs:integer 10', 'xs:integer 12', 'xs:integer 3', 'xs:integer -10']);
    expect(
      evaluate(
        'minutes-from-duration(xs:dayTimeDuration("P3DT10H")), minutes-from-duration(xs:dayTimeDuration("-P5DT12H30M"))'
      )
    ).toEqual(['xs:integer 0', 'xs:integer -30']);
  });

  it('give the seconds as a decimal with their fraction and the duration sign', () => {
    expect(
      evaluate(
        'seconds-from-duration(xs:dayTimeDuration("P3DT10H12.5S")), seconds-from-duration(xs:dayTimeDuration("-PT256S"))'
      )
    ).toEqual(['xs:decimal 12.5', 'xs:decimal -16']);
    expect(evaluate('seconds-from-duration(xs:dayTimeDuration("PT0S"))')).toEqual(['xs:decimal 0']);
  });

  it('take any xs:duration, and give a zero component as 0, not -0', () => {
    expect(
      evaluate('years-from-duration(xs:duration("-P1Y2M3DT4H")), days-from-duration(xs:duration("-P1Y"))')
    ).toEqual(['xs:integer -1', 'xs:integer 0']);
  });

  it('give the empty sequence for the empty sequence', () => {
    expect(
      evaluate(
        'years-from-duration(()), months-from-duration(()), days-from-duration(()), hours-from-duration(()), minutes-from-duration(()), seconds-from-duration(())'
      )
    ).toEqual([]);
  });

  it('raise XPTY0004 for an argument that is not a duration', () => {
    expect(errorCode('years-from-duration(xs:date("2024-01-01"))')).toBe('XPTY0004');
  });
});

describe('the components of dates and times (F&O §9.5 examples)', () => {
  it('give the year, month and day of a date and time, in its own timezone', () => {
    expect(
      evaluate(
        'year-from-dateTime(xs:dateTime("1999-05-31T21:30:00-05:00")), year-from-dateTime(xs:dateTime("1999-12-31T24:00:00")), year-from-dateTime(xs:dateTime("-0002-06-06T00:00:00"))'
      )
    ).toEqual(['xs:integer 1999', 'xs:integer 2000', 'xs:integer -2']);
    expect(
      evaluate(
        'month-from-dateTime(xs:dateTime("1999-12-31T19:20:00-05:00")), month-from-dateTime(adjust-dateTime-to-timezone(xs:dateTime("1999-12-31T19:20:00-05:00"), xs:dayTimeDuration("PT0S")))'
      )
    ).toEqual(['xs:integer 12', 'xs:integer 1']);
    expect(evaluate('day-from-dateTime(xs:dateTime("1999-12-31T20:00:00-05:00"))')).toEqual(['xs:integer 31']);
  });

  it('give the hours, minutes and seconds of a date and time', () => {
    expect(
      evaluate(
        'hours-from-dateTime(xs:dateTime("1999-12-31T21:20:00-05:00")), hours-from-dateTime(xs:dateTime("1999-12-31T24:00:00")), minutes-from-dateTime(xs:dateTime("1999-05-31T13:30:00+05:30"))'
      )
    ).toEqual(['xs:integer 21', 'xs:integer 0', 'xs:integer 30']);
    expect(
      evaluate(
        'seconds-from-dateTime(xs:dateTime("1999-05-31T13:20:00-05:00")), seconds-from-dateTime(xs:dateTime("2024-01-01T00:00:05.250"))'
      )
    ).toEqual(['xs:decimal 0', 'xs:decimal 5.25']);
  });

  it('give the timezone of a date and time as a duration, or nothing when it has none', () => {
    expect(
      evaluate(
        'timezone-from-dateTime(xs:dateTime("1999-05-31T13:20:00-05:00")), timezone-from-dateTime(xs:dateTime("2000-06-12T13:20:00Z")), timezone-from-dateTime(xs:dateTime("2004-08-27T00:00:00"))'
      )
    ).toEqual(['xs:dayTimeDuration -PT5H', 'xs:dayTimeDuration PT0S']);
  });

  it('give the year, month, day and timezone of a date', () => {
    expect(
      evaluate(
        'year-from-date(xs:date("1999-05-31")), year-from-date(xs:date("-0002-06-01")), month-from-date(xs:date("2000-01-01+05:00")), day-from-date(xs:date("1999-05-31-05:00"))'
      )
    ).toEqual(['xs:integer 1999', 'xs:integer -2', 'xs:integer 1', 'xs:integer 31']);
    expect(
      evaluate(
        'timezone-from-date(xs:date("1999-05-31-05:00")), timezone-from-date(xs:date("2000-06-12Z")), timezone-from-date(xs:date("2000-06-12"))'
      )
    ).toEqual(['xs:dayTimeDuration -PT5H', 'xs:dayTimeDuration PT0S']);
  });

  it('give the hours, minutes, seconds and timezone of a time', () => {
    expect(
      evaluate(
        'hours-from-time(xs:time("21:23:00")), hours-from-time(xs:time("01:23:00+05:00")), hours-from-time(xs:time("24:00:00")), minutes-from-time(xs:time("13:00:00Z")), seconds-from-time(xs:time("13:20:10.5"))'
      )
    ).toEqual(['xs:integer 21', 'xs:integer 1', 'xs:integer 0', 'xs:integer 0', 'xs:decimal 10.5']);
    expect(evaluate('timezone-from-time(xs:time("13:20:00+05:30")), timezone-from-time(xs:time("13:20:00"))')).toEqual([
      'xs:dayTimeDuration PT5H30M',
    ]);
  });

  it('take a xs:dateTimeStamp as a xs:dateTime', () => {
    expect(evaluate('year-from-dateTime(xs:dateTimeStamp("2024-02-29T00:00:00Z"))')).toEqual(['xs:integer 2024']);
  });

  it('give the empty sequence for the empty sequence', () => {
    expect(
      evaluate(
        'year-from-dateTime(()), seconds-from-dateTime(()), timezone-from-dateTime(()), day-from-date(()), timezone-from-date(()), hours-from-time(()), seconds-from-time(()), timezone-from-time(())'
      )
    ).toEqual([]);
  });

  it('raise XPTY0004 for a value of another date or time type', () => {
    expect(errorCode('year-from-date(xs:dateTime("2024-01-01T00:00:00"))')).toBe('XPTY0004');
    expect(errorCode('hours-from-time(xs:dateTime("2024-01-01T00:00:00"))')).toBe('XPTY0004');
  });
});
