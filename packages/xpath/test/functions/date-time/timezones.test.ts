import { describe, expect, it } from 'vitest';
import { type TemporalSettings, XPathCompiler } from '@/index';
import { describeItem, errorCode, evaluate } from '../../helpers/evaluate.ts';

const compiler = new XPathCompiler();

/** Evaluates an expression with a clock and an implicit timezone, describing each item of its result. */
function evaluateAt(expression: string, temporal: TemporalSettings): string[] {
  return compiler
    .compile(expression)
    .evaluate(null, { temporal })
    .map((item) => describeItem(item));
}

/** F&O's examples take the implicit timezone to be -05:00. */
const MINUS_FIVE_HOURS: TemporalSettings = { implicitTimezone: '-05:00' };
/** One minute after midnight UTC on a leap day, with milliseconds. */
const LEAP_DAY_MORNING = new Date('2024-02-29T00:01:02.345Z');

describe('fn:dateTime (F&O §9.3.1)', () => {
  it('joins a date and a time', () => {
    expect(evaluate('dateTime(xs:date("1999-12-31"), xs:time("12:00:00"))')).toEqual([
      'xs:dateTime 1999-12-31T12:00:00',
    ]);
    expect(evaluate('dateTime(xs:date("1999-12-31"), xs:time("24:00:00"))')).toEqual([
      'xs:dateTime 1999-12-31T00:00:00',
    ]);
    expect(evaluate('dateTime(xs:date("2024-02-29"), xs:time("12:00:00.5"))')).toEqual([
      'xs:dateTime 2024-02-29T12:00:00.5',
    ]);
  });

  it('takes the timezone of either, or of both when they agree', () => {
    expect(evaluate('dateTime(xs:date("1999-12-31+01:00"), xs:time("12:00:00"))')).toEqual([
      'xs:dateTime 1999-12-31T12:00:00+01:00',
    ]);
    expect(evaluate('dateTime(xs:date("1999-12-31"), xs:time("12:00:00Z"))')).toEqual([
      'xs:dateTime 1999-12-31T12:00:00Z',
    ]);
    expect(evaluate('dateTime(xs:date("1999-12-31Z"), xs:time("12:00:00+00:00"))')).toEqual([
      'xs:dateTime 1999-12-31T12:00:00Z',
    ]);
  });

  it('raises FORG0008 when the timezones differ', () => {
    expect(errorCode('dateTime(xs:date("1999-12-31+01:00"), xs:time("12:00:00+02:00"))')).toBe('FORG0008');
  });

  it('gives the empty sequence when either is empty', () => {
    expect(evaluate('dateTime((), xs:time("12:00:00")), dateTime(xs:date("1999-12-31"), ())')).toEqual([]);
  });
});

describe('fn:adjust-dateTime-to-timezone and its kin (F&O §10.7 examples)', () => {
  it('adjusts to the implicit timezone with one argument', () => {
    expect(
      evaluateAt(
        'adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00")), adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00-07:00"))',
        MINUS_FIVE_HOURS
      )
    ).toEqual(['xs:dateTime 2002-03-07T10:00:00-05:00', 'xs:dateTime 2002-03-07T12:00:00-05:00']);
    expect(evaluateAt('adjust-date-to-timezone(xs:date("2002-03-07-07:00"))', MINUS_FIVE_HOURS)).toEqual([
      'xs:date 2002-03-07-05:00',
    ]);
    expect(evaluateAt('adjust-time-to-timezone(xs:time("10:00:00-07:00"))', MINUS_FIVE_HOURS)).toEqual([
      'xs:time 12:00:00-05:00',
    ]);
  });

  it('adjusts to the timezone given, or takes the timezone away for the empty sequence', () => {
    expect(
      evaluate(
        'adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00-07:00"), xs:dayTimeDuration("PT10H")), adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00-07:00"), ())'
      )
    ).toEqual(['xs:dateTime 2002-03-08T03:00:00+10:00', 'xs:dateTime 2002-03-07T10:00:00']);
    expect(
      evaluate(
        'adjust-date-to-timezone(xs:date("2002-03-07-07:00"), xs:dayTimeDuration("-PT10H")), adjust-date-to-timezone(xs:date("2002-03-07"), ())'
      )
    ).toEqual(['xs:date 2002-03-06-10:00', 'xs:date 2002-03-07']);
    expect(
      evaluate(
        'adjust-time-to-timezone(xs:time("10:00:00-07:00"), xs:dayTimeDuration("PT10H")), adjust-time-to-timezone(xs:time("10:00:00"), xs:dayTimeDuration("-PT14H"))'
      )
    ).toEqual(['xs:time 03:00:00+10:00', 'xs:time 10:00:00-14:00']);
  });

  it('accepts timezones to 14 hours from UTC, PT0S as UTC', () => {
    expect(
      evaluate(
        'adjust-time-to-timezone(xs:time("00:00:00Z"), xs:dayTimeDuration("PT14H")), adjust-time-to-timezone(xs:time("00:00:00+01:00"), xs:dayTimeDuration("PT0S"))'
      )
    ).toEqual(['xs:time 14:00:00+14:00', 'xs:time 23:00:00Z']);
  });

  it('raises FODT0003 for a timezone beyond 14 hours or not whole minutes', () => {
    expect(
      errorCode('adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00"), xs:dayTimeDuration("PT15H"))')
    ).toBe('FODT0003');
    expect(errorCode('adjust-time-to-timezone(xs:time("10:00:00"), xs:dayTimeDuration("-PT14H1M"))')).toBe('FODT0003');
    expect(errorCode('adjust-date-to-timezone(xs:date("2002-03-07"), xs:dayTimeDuration("PT1M30S"))')).toBe('FODT0003');
  });

  it('gives the empty sequence for the empty sequence', () => {
    expect(
      evaluate(
        'adjust-dateTime-to-timezone(()), adjust-date-to-timezone((), ()), adjust-time-to-timezone((), xs:dayTimeDuration("PT1H"))'
      )
    ).toEqual([]);
  });
});

describe('the clock (F&O §15.3)', () => {
  it('gives the current date and time the options fix, in the implicit timezone, to the millisecond', () => {
    const settings = { currentDateTime: LEAP_DAY_MORNING, implicitTimezone: '-05:00' };
    expect(evaluateAt('current-dateTime(), current-date(), current-time()', settings)).toEqual([
      'xs:dateTimeStamp 2024-02-28T19:01:02.345-05:00',
      'xs:date 2024-02-28-05:00',
      'xs:time 19:01:02.345-05:00',
    ]);
    expect(evaluateAt('current-dateTime()', { currentDateTime: LEAP_DAY_MORNING, implicitTimezone: 0 })).toEqual([
      'xs:dateTimeStamp 2024-02-29T00:01:02.345Z',
    ]);
    const newYear = { currentDateTime: new Date('2023-12-31T12:30:00Z'), implicitTimezone: '+14:00' };
    expect(evaluateAt('current-dateTime(), current-date(), current-time()', newYear)).toEqual([
      'xs:dateTimeStamp 2024-01-01T02:30:00+14:00',
      'xs:date 2024-01-01+14:00',
      'xs:time 02:30:00+14:00',
    ]);
  });

  it('gives the same instant for the whole evaluation', () => {
    expect(evaluate('current-dateTime() eq current-dateTime(), current-time() eq current-time()')).toEqual([
      'xs:boolean true',
      'xs:boolean true',
    ]);
  });

  it('reads the clock when the evaluation starts when the options do not fix it', () => {
    const before = Date.now();
    const [now] = compiler.compile('current-dateTime()').evaluateJS() as [{ toDate(): Date }];
    expect(now.toDate().getTime()).toBeGreaterThanOrEqual(before);
    expect(now.toDate().getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('fn:implicit-timezone (F&O §15.3.4)', () => {
  it('gives the implicit timezone the options set, as minutes or as an offset', () => {
    expect(evaluateAt('implicit-timezone()', MINUS_FIVE_HOURS)).toEqual(['xs:dayTimeDuration -PT5H']);
    expect(evaluateAt('implicit-timezone()', { implicitTimezone: 330 })).toEqual(['xs:dayTimeDuration PT5H30M']);
    expect(evaluateAt('implicit-timezone()', { implicitTimezone: 'Z' })).toEqual(['xs:dayTimeDuration PT0S']);
  });

  it("gives the machine's offset by default", () => {
    // Adding zero turns the -0 of a machine on UTC into 0.
    const minutes = -new Date().getTimezoneOffset() + 0;
    expect(compiler.compile('implicit-timezone() div xs:dayTimeDuration("PT1M")').evaluateNumber()).toBe(minutes);
  });
});
