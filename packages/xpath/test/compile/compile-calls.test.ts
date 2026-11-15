import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, LIBRARY, strings } from '../helpers/evaluate.ts';
import { stringsBothWays } from '../helpers/resources.ts';

describe('function calls', () => {
  it('call functions by name and number of arguments, with or without the fn prefix', () => {
    expect(strings('count((1, 2)), fn:count(()), Q{http://www.w3.org/2005/xpath-functions}count(1)')).toEqual([
      '2',
      '0',
      '1',
    ]);
    expect(strings('concat("a", "b", "c", 1)')).toEqual(['abc1']);
  });

  it('convert arguments to the parameter types, raising XPTY0004 when they do not match', () => {
    expect(strings('substring((//price)[1], 1, 1)', LIBRARY)).toEqual(['1']);
    expect(strings('abs((//price)[1])', LIBRARY)).toEqual(['12']);
    expect(strings('substring("abc", 2)')).toEqual(['bc']);
    expect(errorCode('substring(("a", "b"), 1)')).toBe('XPTY0004');
    expect(errorCode('abs("a")')).toBe('XPTY0004');
    expect(errorCode('local-name-from-QName(xs:untypedAtomic("a"))')).toBe('XPTY0117');
  });

  it('call through the arrow operator with the left side first', () => {
    expect(strings('"abc" => substring(2) => upper-case()')).toEqual(['BC']);
    expect(evaluate('"5" => xs:integer()')).toEqual(['xs:integer 5']);
  });

  it('raise XPST0017 for an unknown function or arity', () => {
    expect(errorCode('nonsense()')).toBe('XPST0017');
    expect(errorCode('count()')).toBe('XPST0017');
    expect(errorCode('p:f()', null, { namespaces: { p: 'urn:p' } })).toBe('XPST0017');
    expect(errorCode('p:f()')).toBe('XPST0081');
  });

  it('make a function of the placeholders of a partial application', () => {
    expect(strings('substring(?, 2)("abc"), concat("a", ?, "c")("b")')).toEqual(['bc', 'abc']);
    expect(evaluate('xs:integer(?)("12")')).toEqual(['xs:integer 12']);
    expect(evaluate('substring(?, 1)')).toEqual(['function (anonymous)#1']);
    expect(evaluate('map { "a": 1 }(?)("a"), ["x", "y"](?)(2)')).toEqual(['xs:integer 1', 'xs:string y']);
    expect(strings('[1](?) instance of function(xs:integer) as item()*')).toEqual(['true']);
  });

  it('convert the fixed arguments of a partial application when it is made', () => {
    expect(errorCode('count(substring((1, 2), ?))')).toBe('XPTY0004');
    expect(errorCode('let $f := function($a as xs:integer, $b) { $b } return count($f("x", ?))')).toBe('XPTY0004');
    expect(
      strings(
        'let $f := function($a as xs:double, $b) { $a } return $f(xs:untypedAtomic("2"), ?)(0) instance of xs:double'
      )
    ).toEqual(['true']);
  });

  it('call function items, raising XPTY0004 for anything else or the wrong number of arguments', () => {
    expect(strings('let $f := upper-case#1 return ($f("a"), "b" => $f())')).toEqual(['A', 'B']);
    expect(strings('let $f := concat#3 return $f(?, "-", ?)("a", "b")')).toEqual(['a-b']);
    expect(errorCode('1(2)')).toBe('XPTY0004');
    expect(errorCode('(abs#1, abs#1)(2)')).toBe('XPTY0004');
    expect(errorCode('abs#1(1, 2)')).toBe('XPTY0004');
    expect(errorCode('abs#1(?, 2)')).toBe('XPTY0004');
  });
});

describe('calls that pause for a resource', () => {
  it('wait for the operands that may pause, then evaluate the rest at once', async () => {
    const calls = [
      'count(doc("u:" || "a.xml")//n) + number(doc("u:" || "b.xml"))',
      'concat("n", doc("u:" || "b.xml"), 1 + 1)',
      'xs:integer(doc("u:" || "b.xml")) * 2',
      'let $read := doc#1 return $read("u:" || "b.xml")/b/string()',
      '(function($u) as xs:string { doc($u)/b/string() })("u:" || "b.xml")',
      'substring(?, doc("u:" || "b.xml") - 2)("ab")',
    ].join(', ');
    expect(await stringsBothWays(calls)).toEqual([
      ['5', 'n32', '6', '3', '3', 'ab'],
      ['5', 'n32', '6', '3', '3', 'ab'],
    ]);
  });
});

describe('calls that read only the first items of their argument', () => {
  it('stop reading once those items decide', () => {
    const lazy = 'exists((//book, error())), empty((//book, error())), head((//book/@id, error())) ! string()';
    expect(strings(lazy, LIBRARY)).toEqual(['true', 'false', 'b1']);
    expect(strings('boolean((//book, error())), not((//price, error()))', LIBRARY)).toEqual(['true', 'false']);
    expect(strings('zero-or-one((//book)[2])/@id, exactly-one(//book[1])/@id', LIBRARY)).toEqual(['b2', 'b1']);
    expect(errorCode('zero-or-one((//book, error()))', LIBRARY)).toBe('FORG0003');
    expect(errorCode('exactly-one((//book, error()))', LIBRARY)).toBe('FORG0005');
  });

  it('count without keeping the items', () => {
    expect(strings('count(//book), count(//book/@*), count((1, 2, 3)), count(())', LIBRARY)).toEqual([
      '2',
      '3',
      '3',
      '0',
    ]);
  });

  it('read every item when the argument may pause', async () => {
    expect(await stringsBothWays('exists(doc("u:" || "a.xml")//n), count(doc("u:" || "a.xml")//n)')).toEqual([
      ['true', '2'],
      ['true', '2'],
    ]);
  });
});
