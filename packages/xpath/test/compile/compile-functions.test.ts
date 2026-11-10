import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../helpers/evaluate.ts';

describe('named function references', () => {
  it('refer to constructor functions of one argument and library functions', () => {
    expect(evaluate('xs:integer#1("5"), abs#1(-1)')).toEqual(['xs:integer 5', 'xs:integer 1']);
    expect(evaluate('abs#1')).toEqual(['function fn:abs#1']);
  });

  it('raise XPST0017 for a name and arity no function has', () => {
    expect(errorCode('xs:integer#2')).toBe('XPST0017');
    expect(errorCode('xs:nonsense#1')).toBe('XPST0017');
    expect(errorCode('nonsense#1')).toBe('XPST0017');
  });

  it('raise FOAR0002 for more arguments than a function can take', () => {
    expect(errorCode('abs#4294967296')).toBe('FOAR0002');
    expect(errorCode('concat#4294967295')).toBe('FOAR0002');
    expect(strings('function-arity(concat#123456)')).toEqual(['123456']);
    expect(strings('empty(function-lookup(xs:QName("fn:concat"), 4294967296))')).toEqual(['true']);
  });
});

describe('inline functions', () => {
  it('close over the variables in scope where they are made', () => {
    expect(strings('let $n := 2 return function($x) { $x * $n }(3)')).toEqual(['6']);
    expect(strings('let $f := function($a as xs:integer, $b) { $a - $b } return $f(5, 2)')).toEqual(['3']);
  });

  it('convert their result to the declared type', () => {
    expect(evaluate('function() as xs:double { 1 }()')).toEqual(['xs:double 1']);
    expect(() => evaluate('function() as xs:integer { "a" }()')).toThrow(
      'The result of the anonymous function must be xs:integer, but was given a value of type xs:string'
    );
  });

  it('raise XQST0039 for a parameter declared twice', () => {
    expect(errorCode('function($a, $a) { 1 }')).toBe('XQST0039');
  });
});
