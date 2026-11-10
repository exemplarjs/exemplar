import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  Decimal,
  Duration,
  type XdmArray,
  XdmAtomicValue,
  XdmDocumentBuilder,
  type XdmFunction,
  XdmFunction as XdmFunctionClass,
  type XdmItem,
  XdmMap,
  type XdmNode,
  XMLGregorianCalendar,
  XS,
} from '@exemplarjs/xdm';
import { InvalidArgumentError, XMLInputFactory } from '@exemplarjs/xml';
import {
  PromiseNotAwaitedError,
  type EvaluationArguments,
  type EvaluationOptions,
  type JsValueOf,
  type VariableValues,
  XPathCompiler,
  XPathException,
} from '@/index';
import { LIBRARY } from '../helpers/evaluate.ts';
import { readingWith, resolverOf } from '../helpers/resources.ts';

const compiler = new XPathCompiler();

/** The error a call raises. */
function errorOf(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('nothing was raised');
}

describe('XPathExecutable', () => {
  it('evaluates to exact values, as often as it is run', () => {
    const sum = compiler.compile('sum(//price)');
    expect(sum.evaluate(LIBRARY)).toEqual([XdmAtomicValue.double(20.5)]);
    expect(sum.evaluate(LIBRARY)).toEqual([XdmAtomicValue.double(20.5)]);
    expect(compiler.compile('1 + 1').evaluate()).toEqual([XdmAtomicValue.integer(2n)]);
  });

  it('selects items one at a time, or nodes', () => {
    expect([...compiler.compile('(1, 2)').select()]).toHaveLength(2);
    const books = compiler.compile('//book').selectNodes(LIBRARY);
    expect(books.map((book: XdmNode) => book.localName)).toEqual(['book', 'book']);
  });

  it('raises XPTY0004, naming the method, for a result of another shape than the method gives', () => {
    const two = compiler.compile('(1, 2)');
    const shape = (run: () => unknown): unknown => {
      const error = errorOf(run) as XPathException;
      return [error instanceof XPathException, error.code, error.description];
    };
    expect(shape(() => two.evaluateString())).toEqual([
      true,
      'XPTY0004',
      'evaluateString needs one item; the result has 2',
    ]);
    expect(shape(() => two.evaluateNumber())).toEqual([
      true,
      'XPTY0004',
      'evaluateNumber needs one item; the result has 2',
    ]);
    expect(shape(() => compiler.compile('(//book, 1)').selectNodes(LIBRARY))).toEqual([
      true,
      'XPTY0004',
      'selectNodes needs nodes; the result holds a value of type xs:integer',
    ]);
    expect(shape(() => compiler.compile('map {}').selectNodes())).toEqual([
      true,
      'XPTY0004',
      'selectNodes needs nodes; the result holds a map',
    ]);
    expect(errorOf(() => compiler.compile('[1]').selectNodes()).message).toContain('the result holds an array');
    expect(errorOf(() => compiler.compile('concat#2').selectNodes()).message).toContain('the result holds a function');
  });

  it('refuses to give a whole number or a decimal a JavaScript number cannot hold, as evaluateJS refuses', () => {
    const big = compiler.compile('9007199254740993');
    const advice = '9007199254740993 is too large for a JavaScript number; use evaluate() for the exact value';
    expect(errorOf(() => big.evaluateNumber())).toEqual(new RangeError(advice));
    expect(errorOf(() => compiler.compile('(1, 9007199254740993)').evaluateNumbers())).toEqual(new RangeError(advice));
    expect(errorOf(() => compiler.compile('9007199254740993.5').evaluateNumber())).toBeInstanceOf(RangeError);
    expect(compiler.compile('9007199254740991').evaluateNumber()).toBe(9_007_199_254_740_991);
    expect(compiler.compile('1e300').evaluateNumber()).toBe(1e300);
    expect(compiler.compile('"x"').evaluateNumber()).toBeNaN();
  });

  it('exports the error a synchronous method raises for a resolver that answers with a promise', () => {
    const promised = { resolve: () => Promise.resolve({ text: '<a/>' }) };
    const reading = compiler.compile('doc("http://example.org/a.xml")');
    expect(errorOf(() => reading.evaluate(null, { resources: { uriResolver: promised } }))).toBeInstanceOf(
      PromiseNotAwaitedError
    );
  });

  it('gives strings, numbers and booleans, one or many', () => {
    expect(compiler.compile('//book[1]/@id').evaluateString(LIBRARY)).toBe('b1');
    expect(compiler.compile('()').evaluateString()).toBe('');
    expect(errorOf(() => compiler.compile('(1, 2)').evaluateString())).toMatchObject({ code: 'XPTY0004' });
    expect(compiler.compile('//@id').evaluateStrings(LIBRARY)).toEqual(['b1', 'b2']);
    expect(compiler.compile('(//price)[2]').evaluateNumber(LIBRARY)).toBe(8.5);
    expect(compiler.compile('()').evaluateNumber()).toBeNaN();
    expect(compiler.compile('1.5').evaluateNumber()).toBe(1.5);
    expect(errorOf(() => compiler.compile('(1, 2)').evaluateNumber())).toMatchObject({ code: 'XPTY0004' });
    expect(compiler.compile('(1, 2.5, //price)').evaluateNumbers(LIBRARY)).toEqual([1, 2.5, 12, 8.5]);
    expect(compiler.compile('//book').evaluateBoolean(LIBRARY)).toBe(true);
    expect(errorOf(() => compiler.compile('(1, 2)').evaluateBoolean())).toMatchObject({ code: 'FORG0006' });
  });

  it("gives JavaScript values by the compiler's converters", () => {
    const custom = new XPathCompiler({ converters: { 'xs:integer': { toJS: (value) => value.value } } });
    expect(custom.compile('(1, xs:short(2), "a", //book[1])').evaluateJS(LIBRARY)).toEqual([
      1n,
      2n,
      'a',
      expect.anything(),
    ]);
    expect(compiler.compile('(1, 1.5, true(), xs:hexBinary("0F"), xs:QName("xs:a"))').evaluateJS()).toEqual([
      1,
      1.5,
      true,
      new Uint8Array([15]),
      'xs:a',
    ]);
    expect(errorOf(() => compiler.compile('9007199254740993').evaluateJS())).toBeInstanceOf(RangeError);
  });

  it('gives decimals as numbers, with a RangeError when a number cannot hold the whole part, as for integers', () => {
    expect(compiler.compile('1 div 3, -12.5, 4503599627370495.5').evaluateJS()).toEqual([
      1 / 3,
      -12.5,
      4_503_599_627_370_495.5,
    ]);
    expect(errorOf(() => compiler.compile('12345678901234567890.5').evaluateJS())).toBeInstanceOf(RangeError);
    expect(errorOf(() => compiler.compile('9007199254740991.5').evaluateJS())).toBeInstanceOf(RangeError);
    expect(errorOf(() => compiler.compile('-9007199254740993.0').evaluateJS())).toBeInstanceOf(RangeError);
  });

  it('binds declared variables, converted to their types', () => {
    const add = compiler.compile('$a + $b', { variables: { a: 'xs:integer', b: 'xs:decimal' } });
    expect(add.evaluateString(null, { variables: { a: 1, b: 0.5 } })).toBe('1.5');
    expect(
      (add.evaluate(null, { variables: { a: 2n, b: XdmAtomicValue.integer(1n) } })[0] as XdmAtomicValue).type
    ).toBe(XS.integer);
    const listed = compiler.compile('count($items)', { variables: { items: 'xs:string*' } });
    expect(listed.evaluateNumber(null, { variables: { items: ['a', 'b'] } })).toBe(2);
    expect(listed.evaluateNumber(null, { variables: { items: null } })).toBe(0);
    const node = compiler.compile('$n/@id', { variables: { n: 'element()' } });
    expect(
      node.evaluateString(null, { variables: { n: compiler.compile('//book[1]').selectNodes(LIBRARY)[0] as XdmNode } })
    ).toBe('b1');
  });

  it('checks variables against their types and names', () => {
    const typed = compiler.compile('$a', { variables: { a: 'xs:integer' } });
    expect(errorOf(() => typed.evaluate(null, { variables: { a: 'x' } as never }))).toMatchObject({ code: 'FORG0001' });
    expect(errorOf(() => typed.evaluate(null, { variables: { a: 1.5 } }))).toMatchObject({ code: 'XPTY0004' });
    expect(errorOf(() => typed.evaluate(null, { variables: { a: [1, 2] } as never }))).toMatchObject({
      code: 'XPTY0004',
    });
    expect(errorOf(() => typed.evaluate(null, { variables: { a: Symbol('x') } as never }))).toBeInstanceOf(
      InvalidArgumentError
    );
    expect(errorOf(() => typed.evaluate(null, { variables: { a: 1, b: 2 } as never }))).toBeInstanceOf(
      InvalidArgumentError
    );
    expect(errorOf(() => typed.evaluate(null, { variables: {} as never }))).toMatchObject({ code: 'XPTY0004' });
  });

  it('gives errors of the data model as XPathExceptions', () => {
    const error = errorOf(() => compiler.compile('xs:integer("a")').evaluate());
    expect(error).toBeInstanceOf(XPathException);
    expect(error).toMatchObject({ code: 'FORG0001', message: 'FORG0001: "a" is not a valid xs:integer' });
    expect(errorOf(() => compiler.compile('xs:integer("a")').evaluateNumber())).toBeInstanceOf(XPathException);
    expect(errorOf(() => compiler.compile('if (xs:integer("a")) then 1 else 2').evaluateBoolean())).toBeInstanceOf(
      XPathException
    );
  });

  it('asks each converter for a value of a class of its own, for a variable with a type or without', () => {
    class Money {
      readonly amount: string;

      constructor(amount: string) {
        this.amount = amount;
      }
    }
    const converters = {
      'xs:boolean': { toJS: (value: XdmAtomicValue) => value.value },
      'xs:nonsense': { fromJS: () => XdmAtomicValue.string('never asked') },
      'xs:decimal': {
        fromJS: (value: unknown) =>
          value instanceof Money ? XdmAtomicValue.decimal(Decimal.fromNumber(Number(value.amount))) : undefined,
      },
    };
    const custom = new XPathCompiler<Money>({ converters });
    const untyped = custom.compile('$price * 2', { variables: ['price'] });
    expect(untyped.evaluateString(null, { variables: { price: new Money('9.99') } })).toBe('19.98');
    const typed = custom.compile('$price * 2', { variables: { price: 'xs:decimal' } });
    expect(typed.evaluateString(null, { variables: { price: new Money('1.5') } })).toBe('3');
    expect(errorOf(() => untyped.evaluate(null, { variables: { price: Symbol('none') } }))).toBeInstanceOf(
      InvalidArgumentError
    );
  });

  it("keeps errors that are not the data model's as they are", () => {
    const custom = new XPathCompiler({
      converters: {
        'xs:string': {
          fromJS: () => {
            throw new SyntaxError('mine');
          },
        },
      },
    });
    const echo = custom.compile('$a', { variables: { a: 'xs:string' } });
    expect(errorOf(() => echo.evaluate(null, { variables: { a: 'x' } }))).toBeInstanceOf(SyntaxError);
  });
});

describe('the evaluation options', () => {
  const clock = compiler.compile('current-dateTime(), implicit-timezone()');
  const LEAP_DAY_NOON = new Date('2024-02-29T12:00:00Z');

  it('fix the clock and the implicit timezone for one evaluation', () => {
    const temporal = { currentDateTime: LEAP_DAY_NOON, implicitTimezone: '+01:00' };
    expect(clock.evaluateStrings(null, { temporal })).toEqual(['2024-02-29T13:00:00+01:00', 'PT1H']);
    expect(
      clock.evaluateStrings(null, { temporal: { currentDateTime: LEAP_DAY_NOON, implicitTimezone: -90 } })
    ).toEqual(['2024-02-29T10:30:00-01:30', '-PT1H30M']);
  });

  it('pass through every convenience', () => {
    const temporal = { implicitTimezone: '+01:00' };
    const comparison = compiler.compile('xs:time("10:00:00") eq xs:time("09:00:00Z")');
    expect(comparison.evaluateBoolean(null, { temporal })).toBe(true);
    expect(comparison.evaluateBoolean(null, { temporal: { implicitTimezone: 'Z' } })).toBe(false);
    expect(comparison.evaluateString(null, { temporal })).toBe('true');
    const offset = compiler.compile('implicit-timezone() div xs:dayTimeDuration("PT1M")');
    expect(offset.evaluateNumber(null, { temporal })).toBe(60);
    expect(offset.evaluateNumbers(null, { temporal })).toEqual([60]);
    expect(offset.evaluateJS(null, { temporal })).toEqual([60]);
    expect([...offset.select(null, { temporal })]).toEqual([XdmAtomicValue.decimal(Decimal.of(60n))]);
  });

  it('come after the variables when some are declared', () => {
    const shifted = compiler.compile('$start - implicit-timezone()', { variables: { start: 'xs:time' } });
    const result = shifted.evaluateString(null, {
      variables: { start: '12:00:00' },
      temporal: { implicitTimezone: '+02:00' },
    });
    expect(result).toBe('10:00:00');
  });

  it('raise a RangeError for an implicit timezone out of range', () => {
    expect(errorOf(() => clock.evaluate(null, { temporal: { implicitTimezone: '+15:00' } }))).toBeInstanceOf(
      RangeError
    );
    expect(errorOf(() => clock.evaluate(null, { temporal: { implicitTimezone: 0.5 } }))).toBeInstanceOf(RangeError);
  });
});

describe('dates, times and durations at the boundary', () => {
  it('give dates, times and durations as the classes that hold them', () => {
    const [date, span] = compiler.compile('xs:date("2024-02-29+01:00"), xs:dayTimeDuration("P1DT2H")').evaluateJS();
    expect(date).toBeInstanceOf(XMLGregorianCalendar);
    expect((date as XMLGregorianCalendar<'date'>).day).toBe(29);
    expect(span).toBeInstanceOf(Duration);
    expect((span as Duration).hours).toBe(2);
  });

  it('bind a JavaScript Date as a xs:dateTime in UTC, to the millisecond', () => {
    const echo = compiler.compile('$when', { variables: { when: 'xs:dateTime' } });
    expect(echo.evaluateString(null, { variables: { when: new Date('2024-02-29T12:34:56.789+01:00') } })).toBe(
      '2024-02-29T11:34:56.789Z'
    );
    const twoBce = new Date(Date.UTC(-1, 0, 1));
    expect(echo.evaluateString(null, { variables: { when: twoBce } })).toBe('-0001-01-01T00:00:00Z');
    // One millisecond before the epoch.
    expect(echo.evaluateString(null, { variables: { when: new Date(-1) } })).toBe('1969-12-31T23:59:59.999Z');
    const untyped = compiler.compile('$when instance of xs:dateTime', { variables: ['when'] });
    expect(untyped.evaluateBoolean(null, { variables: { when: new Date(0) } })).toBe(true);
  });

  it('bind a JavaScript Date to the other date and time types by casting it', () => {
    const when = new Date('2024-02-29T23:30:00.5Z');
    const date = compiler.compile('$when', { variables: { when: 'xs:date' } });
    expect(date.evaluateString(null, { variables: { when } })).toBe('2024-02-29Z');
    const time = compiler.compile('$when', { variables: { when: 'xs:time' } });
    expect(time.evaluateString(null, { variables: { when } })).toBe('23:30:00.5Z');
    const stamp = compiler.compile('$when instance of xs:dateTimeStamp', { variables: { when: 'xs:dateTimeStamp' } });
    expect(stamp.evaluateBoolean(null, { variables: { when } })).toBe(true);
  });

  it('raise an InvalidArgumentError for an invalid Date, and XPTY0004 for a Date bound to a type that is no date', () => {
    const echo = compiler.compile('$when', { variables: { when: 'xs:dateTime' } });
    expect(errorOf(() => echo.evaluate(null, { variables: { when: new Date(Number.NaN) } }))).toBeInstanceOf(
      InvalidArgumentError
    );
    const text = compiler.compile('$when', { variables: { when: 'xs:string' } });
    expect(errorOf(() => text.evaluate(null, { variables: { when: new Date(0) } as never }))).toMatchObject({
      code: 'XPTY0004',
    });
  });

  it('bind bytes as binary values, xs:base64Binary unless the type is xs:hexBinary, and give copies back', () => {
    const bytes = compiler.compile('xs:base64Binary("AQI=")').evaluateJS()[0] as Uint8Array;
    const typed = compiler.compile('string($b)', { variables: { b: 'xs:base64Binary' } });
    expect(typed.evaluateString(null, { variables: { b: bytes } })).toBe('AQI=');
    const hex = compiler.compile('string($b)', { variables: { b: 'xs:hexBinary' } });
    expect(hex.evaluateString(null, { variables: { b: new Uint8Array([1, 15]) } })).toBe('010F');
    const untyped = compiler.compile('$b instance of xs:base64Binary', { variables: ['b'] });
    expect(untyped.evaluateBoolean(null, { variables: { b: new Uint8Array([1]) } })).toBe(true);
    // Changing the bytes given or given back changes no value.
    const given = new Uint8Array([1]);
    const held = compiler
      .compile('$b', { variables: { b: 'xs:hexBinary' } })
      .evaluate(null, { variables: { b: given } });
    given[0] = 2;
    expect(compiler.compile('string(.)').evaluateString(held[0])).toBe('01');
    const literal = compiler.compile('xs:hexBinary("0F")');
    (literal.evaluateJS()[0] as Uint8Array)[0] = 0;
    expect(literal.evaluateString()).toBe('0F');
  });

  it('bind calendars and durations as they are, and text by casting it', () => {
    const leapDay = XMLGregorianCalendar.parse('2024-02-29', XS.date);
    const date = compiler.compile('$day + xs:yearMonthDuration("P1Y")', { variables: { day: 'xs:date' } });
    expect(date.evaluateString(null, { variables: { day: leapDay } })).toBe('2025-02-28');
    expect(date.evaluateString(null, { variables: { day: '2024-01-31' } })).toBe('2025-01-31');
    const span = compiler.compile('$span * 2', { variables: { span: 'xs:dayTimeDuration' } });
    expect(span.evaluateString(null, { variables: { span: Duration.parse('PT45M', XS.dayTimeDuration) } })).toBe(
      'PT1H30M'
    );
    expect(span.evaluateString(null, { variables: { span: 'PT1S' } })).toBe('PT2S');
  });

  it('raise an InvalidArgumentError for other objects, XPTY0004 for a value of another date type, and FOTY0013 for a map', () => {
    const date = compiler.compile('$day', { variables: { day: 'xs:date' } });
    expect(errorOf(() => date.evaluate(null, { variables: { day: new (class Day {})() } as never }))).toBeInstanceOf(
      InvalidArgumentError
    );
    expect(errorOf(() => date.evaluate(null, { variables: { day: {} } as never }))).toMatchObject({ code: 'FOTY0013' });
    const dates = compiler.compile('$days', { variables: { days: 'xs:date*' } });
    expect(dates.evaluate(null, { variables: { days: [null] } as never })).toEqual([]);
    const instant = XMLGregorianCalendar.parse('2024-02-29T00:00:00', XS.dateTime);
    expect(errorOf(() => date.evaluate(null, { variables: { day: instant } }))).toMatchObject({ code: 'XPTY0004' });
  });

  it('type the variables of each date, time and duration type', () => {
    expectTypeOf<JsValueOf<'xs:dateTime'>>().toEqualTypeOf<Date | XMLGregorianCalendar | string | XdmItem>();
    expectTypeOf<JsValueOf<'xs:dateTimeStamp?'>>().toExtend<
      Date | XMLGregorianCalendar | string | XdmItem | null | undefined
    >();
    expectTypeOf<JsValueOf<'xs:gMonthDay'>>().toEqualTypeOf<Date | XMLGregorianCalendar | string | XdmItem>();
    expectTypeOf<JsValueOf<'xs:yearMonthDuration'>>().toEqualTypeOf<Duration | string | XdmItem>();
    expectTypeOf<EvaluationArguments<VariableValues<readonly []>>>().toEqualTypeOf<
      [options?: EvaluationOptions & { readonly variables?: Record<string, never> }]
    >();
    expectTypeOf<EvaluationArguments<{ readonly day: unknown }>>().toEqualTypeOf<
      [options: EvaluationOptions & { readonly variables: { readonly day: unknown } }]
    >();
  });

  it('type the variables of each other kind of type, and anything for the rest', () => {
    for (const numeric of [
      expectTypeOf<JsValueOf<'xs:double'>>(),
      expectTypeOf<JsValueOf<'xs:int'>>(),
      expectTypeOf<JsValueOf<'xs:positiveInteger'>>(),
      expectTypeOf<JsValueOf<'xs:unsignedShort'>>(),
    ])
      numeric.toEqualTypeOf<number | bigint | XdmItem>();
    expectTypeOf<JsValueOf<'xs:boolean'>>().toEqualTypeOf<boolean | XdmItem>();
    expectTypeOf<JsValueOf<'xs:NCName'>>().toEqualTypeOf<string | XdmItem>();
    expectTypeOf<JsValueOf<'xs:untypedAtomic'>>().toEqualTypeOf<string | XdmItem>();
    expectTypeOf<JsValueOf<'element(a)'>>().toEqualTypeOf<XdmNode>();
    expectTypeOf<JsValueOf<'node()+'>>().toEqualTypeOf<readonly XdmNode[] | XdmNode>();
    expectTypeOf<JsValueOf<'xs:boolean?'>>().toEqualTypeOf<boolean | XdmItem | null | undefined>();
    expectTypeOf<JsValueOf<'xs:boolean*'>>().toEqualTypeOf<
      readonly (boolean | XdmItem)[] | boolean | XdmItem | null | undefined
    >();
    expectTypeOf<JsValueOf<'empty-sequence()'>>().toEqualTypeOf<readonly [] | null | undefined>();
    expectTypeOf<JsValueOf<'xs:QName'>>().toBeUnknown();
    expectTypeOf<JsValueOf<'item()*'>>().toBeUnknown();
  });
});

describe('maps, arrays and functions at the boundary', () => {
  it('take null inside a list, at any depth, as no item', () => {
    const count = compiler.compile('count($s), count($m?a)', { variables: ['s', 'm'] });
    expect(count.evaluateNumbers(null, { variables: { s: [1, null, 3], m: new Map([['a', [1, null, 3]]]) } })).toEqual([
      2, 2,
    ]);
  });

  it('take a list as a sequence and a list within it as an array, whose members are sequences in turn', () => {
    const nested = compiler.compile(
      'count($x), $x[1] instance of array(*), array:size($x[1]), $x[1]?2 instance of array(*), count($x[1]?2)',
      { variables: ['x'] }
    );
    expect(nested.evaluateJS(null, { variables: { x: [[1, [2, 3]]] } })).toEqual([1, true, 2, false, 2]);
    const members = compiler.compile('array:size($x), count($x?2)', { variables: ['x'] });
    expect(members.evaluateJS(null, { variables: { x: [[1, null, 3]] } })).toEqual([3, 0]);
  });

  it('convert the members of a list within a list to the member type of a declared array type', () => {
    const typed = compiler.compile('count($a), $a[1]?2 instance of xs:integer, array:size($a[2])', {
      variables: { a: 'array(xs:integer)*' },
    });
    expect(typed.evaluateJS(null, { variables: { a: [[1, 2], [3]] } as never })).toEqual([2, true, 1]);
  });

  it('take plain objects as maps with string keys, their values converted in turn', () => {
    const lookup = compiler.compile('$x instance of map(*), count($x?a), $x?a[2] instance of array(*), $x?b?c', {
      variables: ['x'],
    });
    expect(lookup.evaluateJS(null, { variables: { x: { a: [1, [2, 3]], b: { c: 'd' } } } })).toEqual([
      true,
      2,
      true,
      'd',
    ]);
    const keyed = compiler.compile('map:keys($x)', { variables: { x: 'map(xs:string, xs:integer)' } });
    expect(keyed.evaluateJS(null, { variables: { x: { one: 1 } } })).toEqual(['one']);
  });

  it('raise an InvalidArgumentError for other objects, such as class instances, which XPath has no item for', () => {
    class Point {
      readonly x = 1;
    }

    const bind = compiler.compile('1', { variables: ['p'] });
    expect(() => bind.evaluate(null, { variables: { p: new Point() } })).toThrow('has no XPath value');
  });

  it('raise an InvalidArgumentError for a Map key that has no XPath value, such as null', () => {
    const size = compiler.compile('map:size($m)', { variables: ['m'] });
    expect(() => size.evaluate(null, { variables: { m: new Map([[null, 1]]) } })).toThrow(InvalidArgumentError);
  });

  it('convert the keys and values of a Map to the types a declared map type gives', () => {
    const typed = compiler.compile('$m?a + 1, $n?1', {
      variables: { m: 'map(xs:string, xs:integer)', n: 'map(xs:integer, item())' },
    });
    expect(typed.evaluateStrings(null, { variables: { m: new Map([['a', 1]]), n: new Map([[1, 'one']]) } })).toEqual([
      '2',
      'one',
    ]);
  });

  it('refuse function items XPath did not make, which it cannot call', () => {
    class Opaque extends XdmFunctionClass {
      readonly name = undefined;
      readonly arity = 1;
    }

    const bind = compiler.compile('1', { variables: ['f'] });
    expect(() => bind.evaluate(null, { variables: { f: new Opaque() } })).toThrow('has no XPath value');
  });

  it('give maps as Maps and arrays as lists, a value of one item as itself, none as null and others as lists', () => {
    const [map, array] = compiler.compile('map { "a": 1, "b": (2, 3), "c": () }, [1, (), [true()]]').evaluateJS();
    expect(map).toEqual(
      new Map<unknown, unknown>([
        ['a', 1],
        ['b', [2, 3]],
        ['c', null],
      ])
    );
    expect(array).toEqual([1, null, [true]]);
  });

  it('give other function items as they are', () => {
    const [abs] = compiler.compile('abs#1').evaluateJS();
    expect((abs as XdmFunction).arity).toBe(1);
  });

  it('bind Maps as maps, their values converted in turn, and function items as they are', () => {
    const lookup = compiler.compile('$m?a, $m?b, $m(2)', { variables: { m: 'map(*)' } });
    const values = new Map<unknown, unknown>([
      ['a', 1],
      ['b', ['x', 'y']],
      [2, null],
    ]);
    expect(lookup.evaluateJS(null, { variables: { m: values } })).toEqual([1, 'x', 'y']);
    expect(lookup.evaluateJS(null, { variables: { m: XdmMap.EMPTY } })).toEqual([]);
    const call = compiler.compile('$f(-2)', { variables: { f: 'function(xs:integer) as xs:integer' } });
    const abs = compiler.compile('abs#1').evaluate()[0] as XdmFunction;
    expect(call.evaluateJS(null, { variables: { f: abs } })).toEqual([2]);
    expect(errorOf(() => call.evaluate(null, { variables: { f: 1 } as never }))).toMatchObject({ code: 'XPTY0004' });
  });

  it('type the variables of map, array and function types', () => {
    expectTypeOf<JsValueOf<'map(*)'>>().toEqualTypeOf<
      ReadonlyMap<unknown, unknown> | Readonly<Record<string, unknown>> | XdmMap
    >();
    expectTypeOf<JsValueOf<'map(xs:string, xs:integer*)?'>>().toEqualTypeOf<
      ReadonlyMap<unknown, unknown> | Readonly<Record<string, unknown>> | XdmMap | null | undefined
    >();
    expectTypeOf<JsValueOf<'array(*)'>>().toEqualTypeOf<XdmArray>();
    expectTypeOf<JsValueOf<'array(xs:integer)+'>>().toEqualTypeOf<readonly XdmArray[] | XdmArray>();
    expectTypeOf<JsValueOf<'function(*)'>>().toEqualTypeOf<XdmFunction>();
    expectTypeOf<JsValueOf<'function(xs:integer) as xs:integer'>>().toEqualTypeOf<XdmFunction>();
    expectTypeOf<VariableValues<{ f: 'function(xs:string) as xs:string' }>>().toEqualTypeOf<{
      readonly f: XdmFunction;
    }>();
  });
});

describe('errors and numbers at the boundary', () => {
  it('gives errors converting variable values as XPathExceptions', () => {
    const byte = compiler.compile('$v', { variables: { v: 'xs:byte' } });
    expect(errorOf(() => byte.evaluate(null, { variables: { v: 300n } }))).toMatchObject({
      name: 'XPathException',
      code: 'FORG0001',
    });
    const integer = compiler.compile('$v', { variables: { v: 'xs:integer' } });
    expect(errorOf(() => integer.evaluate(null, { variables: { v: 'abc' } as never }))).toMatchObject({
      name: 'XPathException',
      code: 'FORG0001',
    });
  });

  it('gives numbers as fn:number does', () => {
    expect(compiler.compile('("", "0x10", "INF", " 12 ", (//*:title)[1])').evaluateNumbers(LIBRARY)).toEqual([
      Number.NaN,
      Number.NaN,
      Infinity,
      12,
      Number.NaN,
    ]);
    expect(compiler.compile('""').evaluateNumber()).toBeNaN();
  });
});

describe('XPathExecutable, asynchronously', () => {
  const BASE = 'http://example.org/';
  const reading = new XPathCompiler({ baseURI: BASE });
  const library = { [`${BASE}a.xml`]: '<a>1</a>', [`${BASE}b.xml`]: '<b>2</b>', [`${BASE}c.txt`]: 'three' };

  it('waits for a resolver that answers with a promise, and gives what evaluate would give', async () => {
    const promised = resolverOf(library, true);
    const sum = reading.compile('doc("a.xml") + doc("b.xml")');
    expect(await sum.evaluateNumberAsync(null, readingWith(promised))).toBe(3);
    const atOnce = readingWith(resolverOf(library));
    expect(sum.evaluateNumber(null, atOnce)).toBe(3);
  });

  it('fetches the resources an expression names as literals together, before it runs', async () => {
    const promised = resolverOf(library, true);
    const pool = reading.compile('doc("a.xml"), doc-available("b.xml"), unparsed-text("c.txt"), "a.xml" => doc()');
    expect(await pool.evaluateStringsAsync(null, readingWith(promised))).toEqual(['1', 'true', 'three', '1']);
    expect(promised.asked).toEqual([`${BASE}a.xml`, `${BASE}b.xml`, `${BASE}c.txt`]);
  });

  it('runs again from the start for each resource it reaches still to arrive, as for a URI it computes', async () => {
    const promised = resolverOf(library, true);
    const computed = reading.compile('for $name in ("a", "b") return doc($name || ".xml")/*/name()');
    expect(await computed.evaluateStringsAsync(null, readingWith(promised))).toEqual(['a', 'b']);
    expect(promised.asked).toEqual([`${BASE}a.xml`, `${BASE}b.xml`]);
  });

  it('keeps the clock and the documents read for every run of one evaluation', async () => {
    const promised = resolverOf(library, true);
    const stable = reading.compile('current-dateTime() eq (doc("a" || ".xml"), current-dateTime())[2]');
    expect(await stable.evaluateBooleanAsync(null, readingWith(promised))).toBe(true);
  });

  it('has an asynchronous twin for each convenience', async () => {
    const options = readingWith(resolverOf(library, true));
    const one = reading.compile('doc("a.xml")/a');
    const nodes = await one.selectNodesAsync(null, options);
    expect(nodes.map((node) => node.nodeName?.localName)).toEqual(['a']);
    expect(await one.evaluateStringAsync(null, options)).toBe('1');
    expect(await one.evaluateNumbersAsync(null, options)).toEqual([1]);
    expect(await reading.compile('unparsed-text("c.txt")').evaluateJSAsync(null, options)).toEqual(['three']);
    const value = await one.evaluateAsync(null, options);
    expect(value).toHaveLength(1);
  });

  it("waits for the DTDs and entities a document read by doc() refers to, through the builder's resolvers", async () => {
    const entityResolver = { resolveEntity: () => Promise.resolve({ text: '<!ENTITY e "from the DTD">' }) };
    const builder = new XdmDocumentBuilder(new XMLInputFactory({ entityResolver, accessExternalDTD: ['all'] }));
    const uriResolver = resolverOf({ [`${BASE}d.xml`]: '<!DOCTYPE a SYSTEM "a.dtd"><a>&e;</a>' }, true);
    const text = reading.compile('string(doc("d.xml"))');
    expect(await text.evaluateStringAsync(null, { resources: { uriResolver, builder } })).toBe('from the DTD');
    const atOnce = resolverOf({ [`${BASE}d.xml`]: '<!DOCTYPE a SYSTEM "a.dtd"><a>&e;</a>' });
    expect(() => text.evaluateString(null, { resources: { uriResolver: atOnce, builder } })).toThrow(TypeError);
  });

  it('raises FODC0002 for a document whose DTD it waited for that is not well-formed after all', async () => {
    const entityResolver = { resolveEntity: () => Promise.resolve({ text: '<!ENTITY e "x">' }) };
    const builder = new XdmDocumentBuilder(new XMLInputFactory({ entityResolver, accessExternalDTD: ['all'] }));
    const uriResolver = resolverOf({ [`${BASE}d.xml`]: '<!DOCTYPE a SYSTEM "a.dtd"><a>&e;</b>' }, true);
    const broken = reading.compile('doc("d.xml")').evaluateAsync(null, { resources: { uriResolver, builder } });
    await expect(broken).rejects.toThrow(expect.objectContaining({ code: 'FODC0002' }));
  });

  it('raises the XPath errors evaluate raises, and a resolver failure as the function says', async () => {
    const promised = resolverOf(library, true);
    await expect(reading.compile('doc("missing.xml")').evaluateAsync(null, readingWith(promised))).rejects.toThrow(
      expect.objectContaining({ code: 'FODC0002' })
    );
    await expect(reading.compile('1 div 0').evaluateAsync()).rejects.toThrow(XPathException);
    const rejecting = { resolve: () => Promise.reject(new Error('offline')) };
    await expect(reading.compile('unparsed-text("c.txt")').evaluateAsync(null, readingWith(rejecting))).rejects.toThrow(
      expect.objectContaining({ code: 'FOUT1170' })
    );
  });
});

describe('XPathExecutable with a resolver that takes its time', () => {
  it('waits a second for each document an async resolver supplies, by a URI the expression computes', async () => {
    const asked: string[] = [];
    const uriResolver = {
      async resolve(href: string) {
        asked.push(href);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { text: `<book>${href.slice(href.lastIndexOf('/') + 1, -'.xml'.length)}</book>` };
      },
    };
    const titles = new XPathCompiler().compile(
      'for $name in $names return doc("http://example.org/" || $name || ".xml")/book/string()',
      { variables: { names: 'xs:string+' } }
    );
    const result = await titles.evaluateStringsAsync(null, {
      variables: { names: ['dune', 'emma'] },
      resources: { uriResolver },
    });
    expect(result).toEqual(['dune', 'emma']);
    // Neither URI is a literal, so each is asked for only when the evaluation reaches it, and each read once.
    expect(asked).toEqual(['http://example.org/dune.xml', 'http://example.org/emma.xml']);
  });

  it('runs the work before a computed doc() once, pausing there rather than running again', async () => {
    const parsed: string[] = [];
    const builder = new (class extends XdmDocumentBuilder {
      override parse(input: Parameters<XdmDocumentBuilder['parse']>[0]) {
        if (typeof input === 'string') parsed.push(input);
        return super.parse(input);
      }
    })(new XMLInputFactory());
    const uriResolver = {
      resolve: async (href: string) => ({ text: `<book>${href.slice('u:'.length, -'.xml'.length)}</book>` }),
    };
    const titles = new XPathCompiler().compile(
      'for $n in sort(parse-xml("<names><n>emma</n><n>dune</n></names>")//n) return doc("u:" || $n || ".xml")/book/string()'
    );
    const result = await titles.evaluateStringsAsync(null, { resources: { uriResolver, builder } });
    expect(result).toEqual(['dune', 'emma']);
    expect(parsed).toEqual(['<names><n>emma</n><n>dune</n></names>']);
  });
});
