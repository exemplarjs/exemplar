import { describe, expect, it } from 'vitest';
import { errorCode, evaluate } from '../helpers/evaluate.ts';

describe('callFunction', () => {
  it('call maps with a key, giving its value or the empty sequence', () => {
    expect(evaluate('map { 1: "a" }(1.0), map { 1: "a" }(2), map { "a": 1 }(xs:untypedAtomic("a"))')).toEqual([
      'xs:string a',
      'xs:integer 1',
    ]);
    expect(() => evaluate('map { 1: 2 }(())')).toThrow(
      'Argument 1 of the map must be xs:anyAtomicType, but was given 0 items'
    );
  });

  it('call arrays with a position from 1, casting untyped positions', () => {
    expect(evaluate('["x", "y"](2), [5](xs:untypedAtomic("1"))')).toEqual(['xs:string y', 'xs:integer 5']);
    expect(errorCode('[1, 2](3)')).toBe('FOAY0001');
    expect(errorCode('[1, 2](0)')).toBe('FOAY0001');
    expect(() => evaluate('[1]("1")')).toThrow('Argument 1 of the array must be xs:integer');
  });

  it('name the function called with the wrong number of arguments', () => {
    expect(() => evaluate('map {}(1, 2)')).toThrow('the map takes 1 arguments, not 2');
    expect(() => evaluate('[1](1, 2)')).toThrow('the array takes 1 arguments, not 2');
    expect(() => evaluate('abs#1(1, 2)')).toThrow('fn:abs#1 takes 1 arguments, not 2');
    expect(() => evaluate('function() {1}(2)')).toThrow('the anonymous function takes 0 arguments, not 1');
  });
});
