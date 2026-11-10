import { describe, expect, it } from 'vitest';
import { deepEqual } from '@/runtime/deep-equal';
import { errorCode, LIBRARY, parse, strings } from '../helpers/evaluate.ts';

describe('deepEqual', () => {
  it('compares node text by code point when the options name no collation', () => {
    const [same, other, upper] = [parse('<r a="x">t</r>'), parse('<r a="x">t</r>'), parse('<r a="X">t</r>')];
    expect([deepEqual([same], [other], {}), deepEqual([same], [upper], {})]).toEqual([true, false]);
  });

  it('compares maps by their keys and values', () => {
    expect(
      strings(
        'deep-equal(map { 1: "a", 2: "b" }, map { 2.0: "b", 1e0: "a" }), deep-equal(map { 1: "a" }, map {}), ' +
          'deep-equal(map { 1: "a" }, map { 2: "a" }), deep-equal(map { 1: "a" }, map { 1: "b" })'
      )
    ).toEqual(['true', 'false', 'false', 'false']);
  });

  it('compares arrays member by member', () => {
    expect(
      strings(
        'deep-equal([1, (2, 3)], [1, (2, 3)]), deep-equal([], [1]), deep-equal([1, 2], [1, 3]), deep-equal([()], [()])'
      )
    ).toEqual(['true', 'false', 'false', 'true']);
  });

  it('finds items of different kinds unequal', () => {
    expect(
      strings(
        'deep-equal([1], map {}), deep-equal(map {}, [1]), deep-equal([1], 1), deep-equal((//book)[1], [1]), deep-equal(1, (//book)[1])',
        LIBRARY
      )
    ).toEqual(['false', 'false', 'false', 'false', 'false']);
  });

  it('raises FOTY0015 for function items that are not maps or arrays', () => {
    expect(errorCode('deep-equal(function($a, $b) { $a + $b }, function($a, $b) { $a - $b })')).toBe('FOTY0015');
    expect(errorCode('deep-equal(map {}, abs#1)')).toBe('FOTY0015');
    expect(errorCode('deep-equal(1, abs#1)')).toBe('FOTY0015');
    expect(errorCode('deep-equal([abs#1], [abs#1])')).toBe('FOTY0015');
  });
});
