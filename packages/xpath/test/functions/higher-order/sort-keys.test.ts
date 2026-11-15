import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';

describe('sort keys', () => {
  it('keep the order of items whose keys are equal', () => {
    expect(strings('sort(("a1", "b1", "a2"), (), substring(?, 2))')).toEqual(['a1', 'b1', 'a2']);
    expect(strings('array:sort([3, 1.0, 1, 2])?*')).toEqual(['1', '1', '2', '3']);
  });

  it('compare value by value, a shorter key first when one starts the other', () => {
    expect(evaluate('sort(([1, 2], 1))')).toEqual(['xs:integer 1', 'array(2)']);
    expect(evaluate('sort((1, [()]))')).toEqual(['array(1)', 'xs:integer 1']);
    expect(strings('sort(([1, 2], [0, 5], [1]))!string-join(?*, ",")')).toEqual(['0,5', '1', '1,2']);
  });

  it('put NaN before every other value, and equal to itself', () => {
    expect(strings('sort((2, xs:double("NaN"), 1, xs:float("NaN")))')).toEqual(['NaN', 'NaN', '1', '2']);
    expect(strings('sort((xs:double("NaN"), 1)), sort((1, xs:double("NaN")))')).toEqual(['NaN', '1', 'NaN', '1']);
  });

  it('put NaN first beside values it cannot be compared with', () => {
    expect(strings('sort((xs:double("NaN"), "a")), sort(("a", xs:double("NaN")))')).toEqual(['NaN', 'a', 'NaN', 'a']);
  });

  it('take values that are equal but have no order as equal keys', () => {
    expect(strings('sort((xs:QName("b"), xs:QName("b")))')).toEqual(['b', 'b']);
    expect(strings('sort((xs:duration("P1Y"), xs:duration("P12M")))')).toEqual(['P1Y', 'P1Y']);
  });

  it('compare untyped values as strings', () => {
    expect(strings('sort((xs:untypedAtomic("b"), "a", xs:untypedAtomic("c")))')).toEqual(['a', 'b', 'c']);
  });

  it('reject values that cannot be compared', () => {
    expect(errorCode('sort((1, "a"))')).toBe('XPTY0004');
    expect(errorCode('sort((1, xs:untypedAtomic("2")))')).toBe('XPTY0004');
    expect(errorCode('sort((xs:duration("P1Y"), xs:duration("P1D")))')).toBe('XPTY0004');
    expect(errorCode('sort((xs:QName("a"), xs:QName("b")))')).toBe('XPTY0004');
  });
});
