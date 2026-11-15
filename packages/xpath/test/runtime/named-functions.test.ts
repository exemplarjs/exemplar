import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../helpers/evaluate.ts';

describe('named functions as items', () => {
  it('name functions with the usual prefix of their namespace', () => {
    expect(strings('string(function-name(math:pi#0)), string(function-name(xs:integer#1))')).toEqual([
      'math:pi',
      'xs:integer',
    ]);
  });

  it('make constructor functions, of a list type giving its items', () => {
    expect(evaluate('xs:NMTOKENS#1("a b")')).toEqual(['xs:NMTOKEN a', 'xs:NMTOKEN b']);
    expect(
      strings(
        'xs:NMTOKENS#1 instance of function(xs:anyAtomicType?) as xs:NMTOKEN*, xs:integer#1 instance of function(xs:anyAtomicType?) as xs:integer?'
      )
    ).toEqual(['true', 'true']);
  });

  it('look up constructor functions of one argument and library functions by name and arity', () => {
    expect(evaluate('function-lookup(xs:QName("xs:integer"), 1)("5")')).toEqual(['xs:integer 5']);
    expect(evaluate('function-lookup(xs:QName("xs:integer"), 2), function-lookup(xs:QName("xs:nonsense"), 1)')).toEqual(
      []
    );
    expect(evaluate('function-lookup(xs:QName("fn:abs"), 1)(-2), function-lookup(xs:QName("fn:abs"), 3)')).toEqual([
      'xs:integer 2',
    ]);
    expect(errorCode('function-lookup(xs:QName("fn:abs"), 1)("a")')).toBe('XPTY0004');
  });
});
