import { describe, expect, it } from 'vitest';
import { errorCode, evaluate } from '../helpers/evaluate.ts';

describe('options maps', () => {
  it('take a choice, its default when not given, casting an untyped value', () => {
    expect(evaluate('map:merge((map { 1: 1 }, map { 1: 2 }))?1')).toEqual(['xs:integer 1']);
    expect(
      evaluate('map:merge((map { 1: 1 }, map { 1: 2 }), map { "duplicates": xs:untypedAtomic("use-last") })?1')
    ).toEqual(['xs:integer 2']);
  });

  it('raise FOJS0005 for a choice that is not allowed and XPTY0004 for a value of the wrong type', () => {
    expect(() => evaluate('map:merge((), map { "duplicates": "nope" })')).toThrow(
      'The option duplicates must be one of reject, use-first, use-last, use-any, combine, not "nope"'
    );
    expect(errorCode('map:merge((), map { "duplicates": "nope" })')).toBe('FOJS0005');
    expect(() => evaluate('map:merge((), map { "duplicates": 1 })')).toThrow(
      'The option duplicates must be xs:string, but was given a value of type xs:integer'
    );
  });

  it('take booleans, their default when not given', () => {
    expect(
      evaluate('parse-json("[1]", map { "liberal": xs:untypedAtomic("true") }), parse-json("[1]", map {})')
    ).toEqual(['array(1)', 'array(1)']);
    expect(errorCode('parse-json("[1]", map { "liberal": "yes" })')).toBe('XPTY0004');
  });

  it('coerce function options to their type', () => {
    const control = String.raw`parse-json('"\u0001"', map { "fallback": FALLBACK })`;
    expect(evaluate(control.replace('FALLBACK', 'function($s) { "?" }'))).toEqual(['xs:string ?']);
    expect(errorCode(control.replace('FALLBACK', 'function($s) { 1 }'))).toBe('XPTY0004');
  });
});
