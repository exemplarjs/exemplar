import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, LIBRARY } from '../helpers/evaluate.ts';

describe('map constructors', () => {
  it('build maps from keys and values, atomizing keys', () => {
    expect(evaluate('map { "a": 1, (//book)[1]/@id: (2, 3) }?b1', LIBRARY)).toEqual(['xs:integer 2', 'xs:integer 3']);
    expect(evaluate('map {}')).toEqual(['map(0)']);
  });

  it('raise XPTY0004 for a key that is not one value, and XQDY0137 for a key given twice', () => {
    expect(() => evaluate('map { (): 1 }')).toThrow('A map key must be one value, not the empty sequence');
    expect(errorCode('map { (1, 2): 1 }')).toBe('XPTY0004');
    expect(() => evaluate('map { 1: 1, 1.0: 2 }')).toThrow('The map constructor gives the key 1 twice');
    expect(errorCode('map { 1: 1, 1.0: 2 }')).toBe('XQDY0137');
  });
});

describe('array constructors', () => {
  it('make a member of each expression in square brackets and of each item in curly ones', () => {
    expect(evaluate('[1, (2, 3), ()], array { 1, (2, 3), () }')).toEqual(['array(3)', 'array(3)']);
    expect(evaluate('[1, (2, 3)](2), array { 1, (2, 3) }(2)')).toEqual([
      'xs:integer 2',
      'xs:integer 3',
      'xs:integer 2',
    ]);
  });
});

describe('lookups', () => {
  it('look up keys in maps and positions in arrays', () => {
    expect(evaluate('map { "a": 1, "b": 2 }?b, [4, 5, 6]?(1, 3)')).toEqual([
      'xs:integer 2',
      'xs:integer 4',
      'xs:integer 6',
    ]);
    expect(evaluate('(map { "a": 1 }, map { "a": 2 })?a, map { "a": 1 }?("a", "z")')).toEqual([
      'xs:integer 1',
      'xs:integer 2',
      'xs:integer 1',
    ]);
  });

  it('give every value or member for the wildcard', () => {
    expect(evaluate('map { "a": 1, "b": (2, 3) }?*, [1, (2, 3), ()]?*')).toEqual([
      'xs:integer 1',
      'xs:integer 2',
      'xs:integer 3',
      'xs:integer 1',
      'xs:integer 2',
      'xs:integer 3',
    ]);
  });

  it('look up in the context item with the unary form', () => {
    expect(evaluate('map { "a": 1 } ! ?a, [7, 8] ! ?*, ([1], [2]) ! ?1')).toEqual([
      'xs:integer 1',
      'xs:integer 7',
      'xs:integer 8',
      'xs:integer 1',
      'xs:integer 2',
    ]);
    expect(errorCode('?a')).toBe('XPDY0002');
  });

  it('raise XPTY0004 for a lookup on anything else, or an array lookup by a non-integer', () => {
    expect(() => evaluate('1?a')).toThrow('A lookup must be made on maps and arrays');
    expect(errorCode('1 ! ?*')).toBe('XPTY0004');
    expect(errorCode('[1]?("a")')).toBe('XPTY0004');
    expect(errorCode('[1]?name')).toBe('XPTY0004');
    expect(errorCode('[1]?(1.5)')).toBe('XPTY0004');
    expect(errorCode('[1, 2]?3')).toBe('FOAY0001');
  });

  it('look up an array by an untyped key cast to an integer, as calling the array does (XPath §3.11.3.1)', () => {
    expect(evaluate('[1, 2]?(xs:untypedAtomic("2")), [1, 2] ! ?(xs:untypedAtomic("1"))')).toEqual([
      'xs:integer 2',
      'xs:integer 1',
    ]);
    expect(errorCode('[1]?(xs:untypedAtomic("x"))')).toBe('FORG0001');
  });
});
