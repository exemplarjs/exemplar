import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, LIBRARY, strings } from '../helpers/evaluate.ts';

describe('convertArgument', () => {
  it('names a node or function given where another type is wanted', () => {
    expect(() => evaluate('function($a as map(*)) { 1 }((//book)[1])', LIBRARY)).toThrow(
      'Argument 1 of the anonymous function must be map(*), but was given a node of kind element'
    );
    expect(() => evaluate('function($a as xs:integer) { 1 }(abs#1)')).toThrow('FOTY0013');
    expect(() => evaluate('function($a as map(*)) { 1 }(abs#1)')).toThrow('but was given fn:abs#1');
  });

  it('atomizes a value given for xs:error, a union type', () => {
    expect(strings('function($a as xs:error?) { 1 }([()]), function($a as xs:error*) { 2 }([])')).toEqual(['1', '2']);
    expect(errorCode('function($a as xs:error?) { 1 }([1])')).toBe('XPTY0004');
  });

  it('takes the empty sequence for empty-sequence()', () => {
    expect(evaluate('function($a as empty-sequence()) { 1 }(())')).toEqual(['xs:integer 1']);
    expect(errorCode('function($a as empty-sequence()) { 1 }(2)')).toBe('XPTY0004');
  });

  it('passes on items unconverted for map, array and any-function types', () => {
    expect(evaluate('function($a as map(*)) { $a }(map {}), function($f as function(*)) { $f }(abs#1)')).toEqual([
      'map(0)',
      'function fn:abs#1',
    ]);
  });
});

describe('function coercion', () => {
  it('passes on a function whose signature already fits', () => {
    expect(strings('function($f as function(xs:string) as xs:string) { $f("a") }(upper-case#1)')).toEqual(['A']);
  });

  it('wraps a function that does not fit, keeping its name and converting its arguments and result', () => {
    expect(evaluate('function($f as function(xs:string?) as item()*) { $f }(abs#1)')).toEqual(['function fn:abs#1']);
    expect(strings('function($f as function(xs:integer) as xs:integer) { $f(2) }(function($x) { $x * 2 })')).toEqual([
      '4',
    ]);
    expect(
      evaluate(
        'function($f as function(xs:untypedAtomic) as xs:double) { $f(xs:untypedAtomic("2")) }(function($x as xs:integer) { $x })'
      )
    ).toEqual(['xs:double 2']);
  });

  it('raises XPTY0004 when a wrapped function returns the wrong type', () => {
    expect(() => evaluate('function($f as function() as xs:integer) { $f() }(function() { "a" })')).toThrow(
      'The result of the anonymous function must be xs:integer, but was given a value of type xs:string'
    );
    expect(errorCode('function($f as function(xs:string?) as item()*) { $f("a") }(abs#1)')).toBe('XPTY0004');
  });

  it('raises XPTY0004 for a function of another arity or an item that is not a function', () => {
    expect(errorCode('function($f as function() as item()*) { 1 }(abs#1)')).toBe('XPTY0004');
    expect(errorCode('function($f as function() as item()*) { 1 }(1)')).toBe('XPTY0004');
  });
});
