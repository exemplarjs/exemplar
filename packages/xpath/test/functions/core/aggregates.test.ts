import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { describeItem, errorCode, evaluate, LIBRARY } from '../../helpers/evaluate.ts';

const COLLATION = '"http://www.w3.org/2005/xpath-functions/collation/codepoint"';

describe('aggregate functions', () => {
  it('sum numbers, promoting as they meet, with 0 or a given zero for none', () => {
    expect(evaluate('sum((1, 2)), sum((1, 2.5)), sum((1, 2e0)), sum(()), sum((), ()), sum((), 0.0)')).toEqual([
      'xs:integer 3',
      'xs:decimal 3.5',
      'xs:double 3',
      'xs:integer 0',
      'xs:decimal 0',
    ]);
    expect(evaluate('sum(//price)', LIBRARY)).toEqual(['xs:double 20.5']);
    expect(evaluate('sum((1, 2), 0)')).toEqual(['xs:integer 3']);
    expect(errorCode('sum(("a", "b"))')).toBe('FORG0006');
  });

  it('average numbers', () => {
    expect(evaluate('avg((1, 2)), avg(())')).toEqual(['xs:decimal 1.5']);
  });

  it('find the greatest and least values, each keeping its own type within one primitive type', () => {
    expect(evaluate('max((1, 3, 2)), min((1, 3, 2)), max(()), max((1, 2.5)), max((3, 2.5)), max((1, 2e0))')).toEqual([
      'xs:integer 3',
      'xs:integer 1',
      'xs:decimal 2.5',
      'xs:integer 3',
      'xs:double 2',
    ]);
    expect(
      evaluate(
        'max((xs:short(1), xs:short(2))), max((xs:positiveInteger(123), xs:unsignedShort(124))), min((xs:positiveInteger(123), xs:unsignedShort(124)))'
      )
    ).toEqual(['xs:short 2', 'xs:unsignedShort 124', 'xs:positiveInteger 123']);
    expect(evaluate('max((1, xs:float(0.5))), min((xs:float(3), 2.5)), max((xs:float(1), 2e0))')).toEqual([
      'xs:float 1',
      'xs:float 2.5',
      'xs:double 2',
    ]);
    expect(evaluate(`max(("a", "b")), min(("a", xs:anyURI("b")), ${COLLATION}), max(xs:NCName("n"))`)).toEqual([
      'xs:string b',
      'xs:string a',
      'xs:NCName n',
    ]);
    expect(evaluate('max((xs:NCName("a"), xs:anyURI("b"))), max((xs:token("z"), xs:anyURI("b")))')).toEqual([
      'xs:string b',
      'xs:token z',
    ]);
    expect(evaluate('max((true(), false())), max(//price)', LIBRARY)).toEqual(['xs:boolean true', 'xs:double 12']);
  });

  it('give NaN when a value is NaN, once all values compare', () => {
    expect(evaluate('max((1, xs:double("NaN"))), min((xs:float("NaN"), 1))')).toEqual([
      'xs:double NaN',
      'xs:float NaN',
    ]);
    expect(errorCode('max((xs:double("NaN"), "a"))')).toBe('FORG0006');
    expect(errorCode('min((1, "a"))')).toBe('FORG0006');
  });

  it('find the greatest and least strings by the collation given', () => {
    const html = '"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"';
    expect(evaluate(`max(("b", "A"), ${html}), min(("b", "A"), ${html}), max(("b", "A"))`)).toEqual([
      'xs:string b',
      'xs:string A',
      'xs:string b',
    ]);
  });
});

describe('aggregate functions on dates, times and durations', () => {
  const compiler = new XPathCompiler();
  /** Evaluates an expression in an implicit timezone, describing each item of its result. */
  const evaluateIn = (expression: string, implicitTimezone: string): string[] =>
    compiler
      .compile(expression)
      .evaluate(null, { temporal: { implicitTimezone } })
      .map((item) => describeItem(item));

  it('sum and average durations of one ordered subtype (F&O §14.4 examples)', () => {
    expect(evaluate('sum((xs:yearMonthDuration("P20Y"), xs:yearMonthDuration("P10M")))')).toEqual([
      'xs:yearMonthDuration P20Y10M',
    ]);
    expect(evaluate('avg((xs:yearMonthDuration("P20Y"), xs:yearMonthDuration("P10M")))')).toEqual([
      'xs:yearMonthDuration P10Y5M',
    ]);
    expect(evaluate('avg((xs:dayTimeDuration("PT1H"), xs:dayTimeDuration("PT2H")))')).toEqual([
      'xs:dayTimeDuration PT1H30M',
    ]);
    expect(evaluate('sum((), xs:dayTimeDuration("PT0S")), sum(xs:dayTimeDuration("P1D"), ())')).toEqual([
      'xs:dayTimeDuration PT0S',
      'xs:dayTimeDuration P1D',
    ]);
  });

  it('raise FORG0006 for durations of mixed subtypes, xs:duration, or durations with numbers', () => {
    expect(errorCode('sum((xs:yearMonthDuration("P1Y"), xs:dayTimeDuration("P1D")))')).toBe('FORG0006');
    expect(errorCode('avg((xs:duration("P1Y"), xs:duration("P1Y")))')).toBe('FORG0006');
    expect(errorCode('sum((xs:dayTimeDuration("P1D"), 1))')).toBe('FORG0006');
    expect(errorCode('sum((xs:date("2024-01-01"), xs:date("2024-01-02")))')).toBe('FORG0006');
  });

  it('find the latest and earliest dates and times, in the implicit timezone', () => {
    expect(
      evaluate(
        'max((xs:date("2004-01-01Z"), xs:date("2005-01-01Z"))), min((xs:dayTimeDuration("PT1H"), xs:dayTimeDuration("PT2M")))'
      )
    ).toEqual(['xs:date 2005-01-01Z', 'xs:dayTimeDuration PT2M']);
    expect(evaluateIn('min((xs:time("10:00:00"), xs:time("09:30:00Z")))', '+01:00')).toEqual(['xs:time 10:00:00']);
    expect(evaluateIn('min((xs:time("10:00:00"), xs:time("09:30:00Z")))', 'Z')).toEqual(['xs:time 09:30:00Z']);
  });

  it('raise FORG0006 for values without an order', () => {
    expect(errorCode('max((xs:gYear("2024"), xs:gYear("2025")))')).toBe('FORG0006');
    expect(errorCode('min((xs:yearMonthDuration("P1Y"), xs:dayTimeDuration("P1D")))')).toBe('FORG0006');
  });
});
