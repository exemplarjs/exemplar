import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, evaluate, LIBRARY } from '../helpers/evaluate.ts';

describe('arithmetic', () => {
  it('computes with numbers, promoting as XPath does', () => {
    expect(evaluate('1 + 2, 7 - 10, 2 * 3, 1 div 4, 7 idiv 2, 7 mod 2')).toEqual([
      'xs:integer 3',
      'xs:integer -3',
      'xs:integer 6',
      'xs:decimal 0.25',
      'xs:integer 3',
      'xs:integer 1',
    ]);
    expect(evaluate('1 + 1.5, 1.5 + 1e0')).toEqual(['xs:decimal 2.5', 'xs:double 2.5']);
  });

  it('casts untyped operands to doubles', () => {
    expect(evaluate('(//price)[1] + 1', LIBRARY)).toEqual(['xs:double 13']);
  });

  it('gives the empty sequence when either operand is empty', () => {
    expect(evaluate('() + 1, 1 + ()')).toEqual([]);
  });

  it('raises XPTY0004 for operands that are not numbers or not single', () => {
    expect(errorCode('"a" + 1')).toBe('XPTY0004');
    expect(errorCode('(1, 2) + 1')).toBe('XPTY0004');
    expect(errorCode('1 div 0')).toBe('FOAR0001');
  });
});

describe('unary operators', () => {
  it('negate or keep a number', () => {
    expect(evaluate('-1, +2, --3, -1.5, -xs:double(2)')).toEqual([
      'xs:integer -1',
      'xs:integer 2',
      'xs:integer 3',
      'xs:decimal -1.5',
      'xs:double -2',
    ]);
    expect(evaluate('-()')).toEqual([]);
    expect(evaluate('-(//price)[1]', LIBRARY)).toEqual(['xs:double -12']);
    expect(errorCode('-"a"')).toBe('XPTY0004');
  });
});

describe('arithmetic on dates, times and durations', () => {
  it('adds, subtracts and scales durations', () => {
    expect(
      evaluate(
        'xs:yearMonthDuration("P2Y11M") + xs:yearMonthDuration("P3Y3M"), xs:dayTimeDuration("PT2H10M") * 2.1, 2 * xs:dayTimeDuration("PT1H")'
      )
    ).toEqual(['xs:yearMonthDuration P6Y2M', 'xs:dayTimeDuration PT4H33M', 'xs:dayTimeDuration PT2H']);
    expect(
      evaluate('xs:yearMonthDuration("P1M") * 1.5, xs:dayTimeDuration("P1D") div xs:dayTimeDuration("PT1H")')
    ).toEqual(['xs:yearMonthDuration P2M', 'xs:decimal 24']);
  });

  it('moves dates by durations, pinning the day to the end of a shorter month', () => {
    expect(
      evaluate(
        'xs:date("2024-01-31") + xs:yearMonthDuration("P1M"), xs:date("2023-01-31") + xs:yearMonthDuration("P1M")'
      )
    ).toEqual(['xs:date 2024-02-29', 'xs:date 2023-02-28']);
  });

  it('subtracts dates and times, putting those without a timezone in the implicit one', () => {
    const difference = new XPathCompiler()
      .compile('xs:dateTime("2000-10-30T06:12:00") - xs:dateTime("1999-11-28T09:00:00Z")')
      .evaluateStrings(null, { temporal: { implicitTimezone: '-05:00' } });
    expect(difference).toEqual(['P337DT2H12M']);
  });

  it('casts untyped operands to doubles, which scale durations', () => {
    expect(evaluate('xs:untypedAtomic("2") * xs:dayTimeDuration("PT1H")')).toEqual(['xs:dayTimeDuration PT2H']);
  });

  it('raises the errors of date and time arithmetic', () => {
    expect(errorCode('xs:dayTimeDuration("P1D") * xs:double("NaN")')).toBe('FOCA0005');
    expect(errorCode('xs:dayTimeDuration("P1D") * xs:double("INF")')).toBe('FODT0002');
    expect(errorCode('xs:dayTimeDuration("P1D") div 0')).toBe('FODT0002');
    expect(errorCode('xs:date("2024-01-01") + xs:date("2024-01-01")')).toBe('XPTY0004');
    expect(errorCode('xs:date("2024-01-01") + 1')).toBe('XPTY0004');
    expect(errorCode('-xs:dayTimeDuration("P1D")')).toBe('XPTY0004');
  });
});
