import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, evaluate, LIBRARY, strings } from '../helpers/evaluate.ts';
import { stringsBothWays } from '../helpers/resources.ts';

describe('value comparisons', () => {
  it('compare one value with one value', () => {
    expect(strings('1 eq 1, 1 ne 2, 1 lt 2, 2 le 2, 3 gt 2, 2 ge 3')).toEqual([
      'true',
      'true',
      'true',
      'true',
      'true',
      'false',
    ]);
    expect(strings('"a" lt "b"')).toEqual(['true']);
  });

  it('give the empty sequence when either side is empty', () => {
    expect(evaluate('() eq 1')).toEqual([]);
    expect(evaluate('1 eq ()')).toEqual([]);
  });

  it('take untyped values as strings', () => {
    expect(strings('//book[1]/@id eq "b1"', LIBRARY)).toEqual(['true']);
    expect(errorCode('(//price)[1] eq 12', LIBRARY)).toBe('XPTY0004');
  });

  it('raise XPTY0004 for more than one value or values that cannot be compared', () => {
    expect(errorCode('(1, 2) eq 1')).toBe('XPTY0004');
    expect(errorCode('1 eq "1"')).toBe('XPTY0004');
  });
});

describe('general comparisons', () => {
  it('are true when some pair compares true', () => {
    expect(strings('(1, 2) = (2, 3), (1, 2) = (3, 4), () = 1, 1 != 1, (1, 2) != 1')).toEqual([
      'true',
      'false',
      'false',
      'false',
      'true',
    ]);
    expect(strings('(1, 5) < 2, (1, 5) <= 1, (1, 5) > 4, (1, 5) >= 6')).toEqual(['true', 'true', 'true', 'false']);
  });

  it('cast untyped values by the other side: to doubles for numbers, strings for strings, else its type', () => {
    expect(strings('//price = 12', LIBRARY)).toEqual(['true']);
    expect(strings('//price = "12"', LIBRARY)).toEqual(['true']);
    expect(strings('//price = //price', LIBRARY)).toEqual(['true']);
    expect(strings('//@id = xs:anyURI("b2")', LIBRARY)).toEqual(['true']);
    expect(strings('//@id = //@year', LIBRARY)).toEqual(['false']);
    expect(errorCode('//@year = true()', LIBRARY)).toBe('FORG0001');
    expect(errorCode('//@id = 1', LIBRARY)).toBe('FORG0001');
  });

  it('compare nodes by their string values', () => {
    expect(
      strings('//@id = //@id, //@id != //@id, //@id < //@id, //book/@id > "b1", //price >= //@id', LIBRARY)
    ).toEqual(['true', 'true', 'true', 'true', 'false']);
    expect(
      strings('/library/book[1]/@id != /library/book[1]/@id, //dc:title = "Emma"', LIBRARY, {
        namespaces: { dc: 'urn:dc' },
      })
    ).toEqual(['false', 'true']);
  });

  it('compare with an operand that reads no focus once for a whole predicate', () => {
    const books = 'let $first := /library/book[1] return ';
    expect(strings(`${books}(//book)[@id = $first/@id]/@id, ${books}(//book)[$first/@id != @id]/@id`, LIBRARY)).toEqual(
      ['b1', 'b2']
    );
    expect(strings(`${books}count(()[@id = $first/@id]), count((//price)[. = (1 to 12)])`, LIBRARY)).toEqual([
      '0',
      '1',
    ]);
    expect(strings('(//book)[@id eq "b2"]/@id, (//book)[price > 10]/@id', LIBRARY)).toEqual(['b2', 'b1']);
    expect(strings('(//book)["b1" = @id]/@id, (//book)[10 < price]/@id, //book[@id = "b2"]/@id', LIBRARY)).toEqual([
      'b1',
      'b1',
      'b2',
    ]);
    expect(
      strings(
        `${books}(count((//book)[@missing = $first/@id]), count(//book[$first/@id < @id]), count(//book[@id > $first/@id]))`,
        LIBRARY
      )
    ).toEqual(['0', '1', '1']);
  });

  it('wait for an operand that pauses in such a predicate, on either side', async () => {
    expect(await stringsBothWays('(doc("u:" || "a.xml")/a/n)[2 = doc("u:" || . || ".xml")/x]/string()')).toEqual([
      ['2'],
      ['2'],
    ]);
    expect(await stringsBothWays('(doc("u:" || "a.xml")/a/n)[. = doc("u:" || "2.xml")/x]/string()')).toEqual([
      ['2'],
      ['2'],
    ]);
  });

  it('compare with a range by its bounds, without making its integers', () => {
    expect(strings('5 = (1 to 10), 11 = (1 to 10), 2.5 = (1 to 10), 1000000000000 = (1 to 1000000000000)')).toEqual([
      'true',
      'false',
      'false',
      'true',
    ]);
    expect(strings('(1 to 10) = 5, (1 to 10) < 2, (1 to 10) > 10, 0 < (1 to 10), 10 >= (1 to 10)')).toEqual([
      'true',
      'true',
      'false',
      'true',
      'true',
    ]);
    expect(strings('1 != (1 to 2), 1 != (1 to 1), 3 != (3 to 3), 1 = (2 to 1), 1 = (() to 3)')).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(strings('xs:untypedAtomic("3") = (1 to 5), xs:double("NaN") = (1 to 5), 1 <= (5 to 9)')).toEqual([
      'true',
      'false',
      'true',
    ]);
    expect(errorCode('"a" = (1 to 5)')).toBe('XPTY0004');
  });
});

describe('node comparisons', () => {
  it('compare identity and document order', () => {
    expect(strings('//book[1] is //book[1], //book[1] is //book[2]', LIBRARY)).toEqual(['true', 'false']);
    expect(strings('//book[1] << //book[2], //book[1] >> //book[2]', LIBRARY)).toEqual(['true', 'false']);
    expect(evaluate('() is //book[1]', LIBRARY)).toEqual([]);
    expect(evaluate('//book[1] is ()', LIBRARY)).toEqual([]);
  });

  it('take one node or none on each side', () => {
    expect(errorCode('//book is //book[1]', LIBRARY)).toBe('XPTY0004');
    expect(errorCode('1 is //book[1]', LIBRARY)).toBe('XPTY0004');
  });
});

describe('range comparisons with floats and doubles', () => {
  it('compare as comparing with each integer would, after promotion to float or double', () => {
    expect(
      strings(
        'xs:float(16777216) = (16777217 to 16777218), xs:double(9007199254740992) = (9007199254740993 to 9007199254740993)'
      )
    ).toEqual(['true', 'true']);
    expect(
      strings(
        'xs:float(16777216) != (16777216 to 16777217), xs:double(9007199254740992) != (9007199254740992 to 9007199254740993)'
      )
    ).toEqual(['false', 'false']);
  });
});

describe('comparisons of dates, times and durations', () => {
  const compiler = new XPathCompiler();
  /** The string values of an expression's result, evaluated in an implicit timezone. */
  const stringsIn = (expression: string, implicitTimezone: string): string[] =>
    compiler.compile(expression).evaluateStrings(null, { temporal: { implicitTimezone } });

  it('put values without a timezone in the implicit timezone of the evaluation', () => {
    expect(stringsIn('xs:time("10:00:00") eq xs:time("09:00:00Z")', '+01:00')).toEqual(['true']);
    expect(stringsIn('xs:time("10:00:00") eq xs:time("09:00:00Z")', 'Z')).toEqual(['false']);
    expect(stringsIn('xs:dateTime("2024-01-01T00:00:00") lt xs:dateTime("2024-01-01T00:00:00Z")', '+01:00')).toEqual([
      'true',
    ]);
    expect(stringsIn('(xs:time("08:00:00"), xs:time("10:00:00")) = xs:time("09:00:00Z")', '+01:00')).toEqual(['true']);
  });

  it('order dates and durations of one ordered subtype, and compare all durations for equality', () => {
    expect(
      strings(
        'xs:date("2024-02-29Z") gt xs:date("2024-02-28Z"), xs:dayTimeDuration("PT1H") lt xs:dayTimeDuration("PT61M")'
      )
    ).toEqual(['true', 'true']);
    expect(
      strings(
        'xs:yearMonthDuration("P0M") eq xs:dayTimeDuration("PT0S"), xs:duration("P1Y") = xs:yearMonthDuration("P12M")'
      )
    ).toEqual(['true', 'true']);
  });

  it('cast untyped values to the date type on the other side', () => {
    expect(strings('xs:untypedAtomic("2024-02-29Z") = xs:date("2024-02-29Z")')).toEqual(['true']);
    expect(errorCode('xs:untypedAtomic("2024-02-30") = xs:date("2024-02-29")')).toBe('FORG0001');
  });

  it('raise XPTY0004 for an order between xs:g* values or xs:duration values, or between types', () => {
    expect(errorCode('xs:gYear("2024") lt xs:gYear("2025")')).toBe('XPTY0004');
    expect(errorCode('xs:duration("P1Y") lt xs:duration("P2Y")')).toBe('XPTY0004');
    expect(errorCode('xs:yearMonthDuration("P1Y") < xs:dayTimeDuration("P1D")')).toBe('XPTY0004');
    expect(errorCode('xs:date("2024-01-01") eq xs:dateTime("2024-01-01T00:00:00")')).toBe('XPTY0004');
    expect(strings('xs:gYear("2024Z") eq xs:gYear("2024Z")')).toEqual(['true']);
  });
});
