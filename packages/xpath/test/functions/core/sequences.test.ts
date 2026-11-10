import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, evaluate, LIBRARY, parse, strings } from '../../helpers/evaluate.ts';

const COLLATION = '"http://www.w3.org/2005/xpath-functions/collation/codepoint"';

describe('sequence functions', () => {
  it('test and count sequences', () => {
    expect(strings('empty(()), empty(1), exists(()), exists(1), count((1, 2))')).toEqual([
      'true',
      'false',
      'false',
      'true',
      '2',
    ]);
  });

  it('take apart and rearrange sequences', () => {
    expect(strings('head((1, 2)), tail((1, 2, 3)), reverse((1, 2)), unordered((1, 2))')).toEqual([
      '1',
      '2',
      '3',
      '2',
      '1',
      '1',
      '2',
    ]);
    expect(strings('insert-before((1, 2), 2, 9), insert-before((1, 2), 0, 9), insert-before((1, 2), 5, 9)')).toEqual([
      '1',
      '9',
      '2',
      '9',
      '1',
      '2',
      '1',
      '2',
      '9',
    ]);
    expect(strings('remove((1, 2, 3), 2), remove((1, 2), 0), remove((1, 2), 3)')).toEqual([
      '1',
      '3',
      '1',
      '2',
      '1',
      '2',
    ]);
  });

  it('take subsequences by rounded positions', () => {
    expect(
      strings('subsequence((1, 2, 3, 4), 2), subsequence((1, 2, 3, 4), 1.5, 2), subsequence((1, 2, 3), 0, 2)')
    ).toEqual(['2', '3', '4', '2', '3', '1']);
    expect(
      strings(
        'subsequence((1, 2), xs:double("NaN")), subsequence((1, 2), 1, xs:double("NaN")), subsequence((1, 2), 2, 0)'
      )
    ).toEqual([]);
    expect(strings('subsequence((1, 2), -1 div 0e0, 1 div 0e0)')).toEqual([]);
    expect(strings('subsequence((1, 2), -1 div 0e0)')).toEqual(['1', '2']);
  });

  it('give distinct values, the first of each set, NaN equal to itself', () => {
    expect(
      evaluate('distinct-values((1, 1.0, "1", xs:untypedAtomic("1"), xs:double("NaN"), xs:float("NaN")))')
    ).toEqual(['xs:integer 1', 'xs:string 1', 'xs:double NaN']);
    expect(strings(`distinct-values(("a", "a"), ${COLLATION})`)).toEqual(['a']);
  });

  it('give positions of equal values, NaN equal to nothing', () => {
    expect(
      strings(
        `index-of((1, 2, 1), 1), index-of(("a", 1), "a"), index-of(xs:double("NaN"), xs:double("NaN")), index-of(("a"), "a", ${COLLATION})`
      )
    ).toEqual(['1', '3', '1', '1']);
    expect(strings('index-of(//@id, "b2")', LIBRARY)).toEqual(['2']);
  });

  it('compare sequences deeply', () => {
    expect(
      strings(
        `deep-equal((1, 2), (1, 2)), deep-equal(1, (1, 2)), deep-equal(1, "1"), deep-equal(xs:double("NaN"), xs:float("NaN")), deep-equal(1, 1, ${COLLATION})`
      )
    ).toEqual(['true', 'false', 'false', 'true', 'true']);
    expect(
      strings('deep-equal(//book[1], //book[1]), deep-equal(//book[1], //book[2]), deep-equal(//book[1], 1)', LIBRARY)
    ).toEqual(['true', 'false', 'false']);
  });

  it('check the number of items', () => {
    expect(strings('zero-or-one(()), zero-or-one(1), one-or-more((1, 2)), exactly-one(1)')).toEqual([
      '1',
      '1',
      '2',
      '1',
    ]);
    expect(errorCode('zero-or-one((1, 2))')).toBe('FORG0003');
    expect(errorCode('one-or-more(())')).toBe('FORG0004');
    expect(errorCode('exactly-one(())')).toBe('FORG0005');
  });

  it('compare values by the collation given', () => {
    const html = '"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"';
    expect(strings(`distinct-values(("a", "A", "b"), ${html})`)).toEqual(['a', 'b']);
    expect(strings(`index-of(("A", "b", "a"), "a", ${html})`)).toEqual(['1', '3']);
    expect(strings(`string(deep-equal(("A", 1), ("a", 1), ${html}))`)).toEqual(['true']);
  });
});

describe('sequence functions on dates, times and durations', () => {
  const compiler = new XPathCompiler();
  /** The string values of an expression's result, evaluated in an implicit timezone. */
  const stringsIn = (expression: string, implicitTimezone: string): string[] =>
    compiler.compile(expression).evaluateStrings(null, { temporal: { implicitTimezone } });

  it('find distinct values and positions in the implicit timezone', () => {
    const times = '(xs:time("10:00:00"), xs:time("09:00:00Z"), xs:time("11:00:00"))';
    expect(stringsIn(`distinct-values(${times})`, '+01:00')).toEqual(['10:00:00', '11:00:00']);
    expect(stringsIn(`distinct-values(${times})`, 'Z')).toEqual(['10:00:00', '09:00:00Z', '11:00:00']);
    expect(stringsIn(`index-of(${times}, xs:time("09:00:00Z"))`, '+01:00')).toEqual(['1', '2']);
  });

  it('take P0M and PT0S as one value, and values that cannot be compared as different', () => {
    expect(strings('count(distinct-values((xs:yearMonthDuration("P0M"), xs:dayTimeDuration("PT0S"))))')).toEqual(['1']);
    expect(strings('count(distinct-values((xs:date("2024-01-01"), xs:gYear("2024"), 1)))')).toEqual(['3']);
  });

  it('compare dates deeply in the implicit timezone', () => {
    const pair = 'deep-equal((xs:dateTime("2024-01-01T01:00:00"), 1), (xs:dateTime("2024-01-01T00:00:00Z"), 1))';
    expect(stringsIn(pair, '+01:00')).toEqual(['true']);
    expect(stringsIn(pair, 'Z')).toEqual(['false']);
    expect(strings('deep-equal(xs:date("2024-01-01"), xs:dateTime("2024-01-01T00:00:00"))')).toEqual(['false']);
  });
});

describe('deep-equal, found in review', () => {
  it('compares the text and attributes of nodes by the collation given', () => {
    const html = '"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"';
    const doc = '<r><a x="p">x</a><a x="P">X</a></r>';
    expect(
      strings(
        `string(deep-equal(//a[1], //a[2], ${html})), string(deep-equal(//a[1]/@x, //a[2]/@x, ${html}))`,
        parse(doc)
      )
    ).toEqual(['true', 'true']);
    expect(strings('string(deep-equal(//a[1], //a[2]))', parse(doc))).toEqual(['false']);
  });
});

describe('distinct-values over many values', () => {
  it('keeps the first of equal values across numeric types, string types, durations and NaN, in order', () => {
    const mixed =
      '(1, xs:double(1), 2.0, xs:float(2), "x", xs:anyURI("x"), xs:untypedAtomic("y"), "y", ' +
      'xs:dayTimeDuration("PT0S"), xs:yearMonthDuration("P0M"), xs:double("NaN"), xs:double("NaN"), true(), "true")';
    expect(evaluate(`distinct-values(${mixed})`)).toEqual([
      'xs:integer 1',
      'xs:decimal 2',
      'xs:string x',
      'xs:untypedAtomic y',
      'xs:dayTimeDuration PT0S',
      'xs:double NaN',
      'xs:boolean true',
      'xs:string true',
    ]);
  });

  it('compares numbers of different types by promotion, and -0 and 0 as equal', () => {
    expect(evaluate("distinct-values((xs:decimal('1.2'), xs:float('1.2')))")).toEqual(['xs:decimal 1.2']);
    expect(evaluate("distinct-values((xs:double('1.2'), xs:float('1.2'), 1.2))")).toEqual([
      'xs:double 1.2',
      'xs:float 1.2',
    ]);
    expect(evaluate("distinct-values((xs:double('-0'), xs:double('0'), 0))")).toEqual(['xs:double -0']);
  });

  it('keeps one of each of thousands of strings and integers', () => {
    expect(strings('count(distinct-values((1 to 5000) ! (. mod 1000, string(. mod 300))))')).toEqual(['1300']);
  });
});
