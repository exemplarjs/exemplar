import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';
import { stringsBothWays } from '../../helpers/resources.ts';

const CASE_BLIND = '"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"';

/** The members of an array result, each as its items joined by commas. */
function members(expression: string): string[] {
  return strings(`(${expression}) ! array:for-each(., function($m) { string-join($m, ",") })?*`);
}

describe('array:size, array:get and array:put', () => {
  it('give the size and the member at a position', () => {
    expect(strings('array:size([]), array:size([1, (2, 3), ()])')).toEqual(['0', '3']);
    expect(strings('array:get([5, (6, 7)], 2), array:get([5], 1)')).toEqual(['6', '7', '5']);
    expect(evaluate('array:get([()], 1)')).toEqual([]);
  });

  it('replace the member at a position', () => {
    expect(members('array:put([1, 2, 3], 2, ("a", "b"))')).toEqual(['1', 'a,b', '3']);
    expect(members('array:put([1], 1, ())')).toEqual(['']);
  });

  it('reject a position outside the array', () => {
    expect(errorCode('array:get([5, 6, 7], 0)')).toBe('FOAY0001');
    expect(errorCode('array:get([5, 6, 7], 4)')).toBe('FOAY0001');
    expect(errorCode('array:get([], 1)')).toBe('FOAY0001');
    expect(errorCode('array:put([1, 2], 3, "a")')).toBe('FOAY0001');
    expect(errorCode('array:put([1, 2], -1, "a")')).toBe('FOAY0001');
  });
});

describe('array:append, array:insert-before and array:join', () => {
  it('append a member', () => {
    expect(members('array:append([1], (2, 3)), array:append([], ())')).toEqual(['1', '2,3', '']);
  });

  it('insert a member before a position, or at the end', () => {
    expect(members('array:insert-before([1, 2], 1, "a")')).toEqual(['a', '1', '2']);
    expect(members('array:insert-before([1, 2], 3, ("a", "b"))')).toEqual(['1', '2', 'a,b']);
    expect(members('array:insert-before([], 1, ())')).toEqual(['']);
  });

  it('reject an insert position outside the array and its end', () => {
    expect(errorCode('array:insert-before([1, 2], 0, "a")')).toBe('FOAY0001');
    expect(errorCode('array:insert-before([], 2, ())')).toBe('FOAY0001');
  });

  it('join arrays end to end', () => {
    expect(members('array:join(([1, 2], [], [(3, 4)]))')).toEqual(['1', '2', '3,4']);
    expect(strings('array:size(array:join(()))')).toEqual(['0']);
  });
});

describe('array:subarray', () => {
  it('gives the members from a start to the end', () => {
    expect(members('array:subarray([1, 2, 3], 2)')).toEqual(['2', '3']);
    expect(strings('array:size(array:subarray([1, 2, 3], 4))')).toEqual(['0']);
  });

  it('gives the members from a start for a length', () => {
    expect(members('array:subarray([1, 2, 3, 4], 2, 2)')).toEqual(['2', '3']);
    expect(members('array:subarray([1, 2, 3], 1, 3)')).toEqual(['1', '2', '3']);
    expect(strings('array:size(array:subarray([1, 2, 3], 4, 0)), array:size(array:subarray([1], 1, 0))')).toEqual([
      '0',
      '0',
    ]);
  });

  it('rejects a start outside the array and its end', () => {
    expect(errorCode('array:subarray([1, 2, 3], 0)')).toBe('FOAY0001');
    expect(errorCode('array:subarray([1, 2, 3], 5)')).toBe('FOAY0001');
    expect(errorCode('array:subarray([1, 2, 3], 4294967297, 2)')).toBe('FOAY0001');
  });

  it('rejects a negative length, or one past the end', () => {
    expect(errorCode('array:subarray([1, 2, 3], 2, -1)')).toBe('FOAY0002');
    expect(errorCode('array:subarray([1, 2, 3], 2, 3)')).toBe('FOAY0001');
  });
});

describe('array:remove', () => {
  it('removes the members at some positions', () => {
    expect(members('array:remove([1, 2, 3, 4], (1, 3))')).toEqual(['2', '4']);
    expect(members('array:remove([1, 2], (2, 2))')).toEqual(['1']);
    expect(members('array:remove([1, 2], ())')).toEqual(['1', '2']);
    expect(strings('array:size(array:remove([], ()))')).toEqual(['0']);
  });

  it('rejects a position outside the array', () => {
    expect(errorCode('array:remove([], 1)')).toBe('FOAY0001');
    expect(errorCode('array:remove([4, 5, 6], 0)')).toBe('FOAY0001');
    expect(errorCode('array:remove(["a", "b", "c", "d"], 4 to 5)')).toBe('FOAY0001');
  });
});

describe('array:head, array:tail and array:reverse', () => {
  it('give the first member and the rest', () => {
    expect(strings('array:head([(1, 2), 3])')).toEqual(['1', '2']);
    expect(members('array:tail([1, 2, (3, 4)])')).toEqual(['2', '3,4']);
    expect(strings('array:size(array:tail([1]))')).toEqual(['0']);
  });

  it('reject an empty array', () => {
    expect(errorCode('array:head([])')).toBe('FOAY0001');
    expect(errorCode('array:tail([])')).toBe('FOAY0001');
  });

  it('reverse the members', () => {
    expect(members('array:reverse([1, (2, 3), 4])')).toEqual(['4', '2,3', '1']);
    expect(strings('array:size(array:reverse([]))')).toEqual(['0']);
  });
});

describe('array:for-each, array:filter and array:for-each-pair', () => {
  it('apply a function to each member', () => {
    expect(members('array:for-each([1, (2, 3)], function($m) { sum($m) })')).toEqual(['1', '5']);
    expect(strings('array:size(array:for-each([], count#1))')).toEqual(['0']);
  });

  it('keep the members the predicate is true for', () => {
    expect(members('array:filter([1, (), (2, 3), 4], function($m) { count($m) = 1 })')).toEqual(['1', '4']);
    expect(errorCode('array:filter([1, 2], function($m) { $m })')).toBe('XPTY0004');
  });

  it('apply a function to members at the same positions, as far as the shorter array', () => {
    expect(members('array:for-each-pair([1, 2, 3], [10, 20], function($a, $b) { $a + $b })')).toEqual(['11', '22']);
    expect(members('array:for-each-pair([1], [(2, 3), 4], function($a, $b) { ($a, $b) })')).toEqual(['1,2,3']);
    expect(strings('array:size(array:for-each-pair([], [1], concat#2))')).toEqual(['0']);
  });
});

describe('array:fold-left and array:fold-right', () => {
  it('fold the members from the first or the last', () => {
    const step = 'function($a, $b) { concat("f(", string-join($a, "+"), ",", string-join($b, "+"), ")") }';
    expect(strings(`array:fold-left([1, (2, 3)], "", ${step})`)).toEqual(['f(f(,1),2+3)']);
    expect(strings(`array:fold-right([1, (2, 3)], "", ${step})`)).toEqual(['f(1,f(2+3,))']);
  });

  it('give the zero value for an empty array', () => {
    expect(strings('array:fold-left([], "zero", concat#2), array:fold-right([], "zero", concat#2)')).toEqual([
      'zero',
      'zero',
    ]);
    expect(evaluate('array:fold-left([], (), concat#2)')).toEqual([]);
  });
});

describe('array:sort', () => {
  it('sorts the members by their atomized values', () => {
    expect(members('array:sort([3, 1, 2]), array:sort(["b", "a", "B"])')).toEqual(['1', '2', '3', 'B', 'a', 'b']);
    expect(members('array:sort([(1, 2), 1, ()])')).toEqual(['', '1', '1,2']);
  });

  it('sorts by a collation', () => {
    expect(members(`array:sort(["b", "C", "a"], ${CASE_BLIND})`)).toEqual(['a', 'b', 'C']);
    expect(members('array:sort(["b", "C", "a"], ())')).toEqual(['C', 'a', 'b']);
  });

  it('sorts by the keys a function gives', () => {
    expect(members('array:sort([1, -3, 2], (), abs#1)')).toEqual(['1', '2', '-3']);
    expect(members('array:sort([(3, 1), (2, 5)], (), function($m) { sum($m) })')).toEqual(['3,1', '2,5']);
  });

  it('rejects keys that cannot be compared', () => {
    expect(errorCode('array:sort([1, "a"])')).toBe('XPTY0004');
  });
});

describe('array:flatten', () => {
  it('replaces arrays by their members, at every depth', () => {
    expect(strings('array:flatten([1, [2, [3, (4, 5)]], ()]), array:flatten((6, [7]))')).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
    expect(evaluate('array:flatten(()), array:flatten([[]])')).toEqual([]);
    expect(evaluate('array:flatten(map{})')).toEqual(['map(0)']);
  });
});

describe('array functions whose function pauses for a resource', () => {
  it('call it for each member in turn, waiting for each', async () => {
    const read = 'function($i) { doc("u:" || $i || ".xml")/x/string() }';
    const calls = [
      `array:for-each([1, 2], ${read})?*`,
      `array:filter([1, 2], function($i) { doc("u:" || $i || ".xml") = 2 })?*`,
      `array:fold-left([1, 2], "", function($all, $i) { $all || ${read}($i) })`,
      `array:for-each-pair([1], [2], function($a, $b) { ${read}($a) || ${read}($b) })?*`,
      `array:sort([2, 1], (), ${read})?*`,
    ].join(', ');
    expect(await stringsBothWays(calls)).toEqual([
      ['1', '2', '2', '12', '12', '1', '2'],
      ['1', '2', '2', '12', '12', '1', '2'],
    ]);
  });
});
