import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';
import { stringsBothWays } from '../../helpers/resources.ts';

const TWO_FOOS = '(map:entry("foo", 3), map:entry("foo", 4), map{"bar": 5})';

describe('map:merge', () => {
  it('gives the entries of every map', () => {
    expect(strings('let $m := map:merge((map{"a": 1}, map{"b": 2})) return (map:size($m), $m?a, $m?b)')).toEqual([
      '2',
      '1',
      '2',
    ]);
    expect(evaluate('map:merge(()), map:merge((), map{})')).toEqual(['map(0)', 'map(0)']);
  });

  it('keeps the first value of a key given twice by default', () => {
    expect(strings(`map:merge(${TWO_FOOS})?foo, map:merge(${TWO_FOOS}, map{})?foo`)).toEqual(['3', '3']);
  });

  it('handles a key given twice as the duplicates option says', () => {
    const merged = (duplicates: string): string[] =>
      strings(`map:merge(${TWO_FOOS}, map{"duplicates": "${duplicates}"})?foo`);
    expect(merged('use-first')).toEqual(['3']);
    expect(merged('use-last')).toEqual(['4']);
    expect(merged('use-any')).toEqual(['3']);
    expect(merged('combine')).toEqual(['3', '4']);
  });

  it('rejects a key given twice when the duplicates option is reject', () => {
    expect(errorCode(`map:merge(${TWO_FOOS}, map{"duplicates": "reject"})`)).toBe('FOJS0003');
    expect(strings('map:size(map:merge((map{"a": 1}, map{"b": 2}), map{"duplicates": "reject"}))')).toEqual(['2']);
  });

  it('rejects a duplicates option that is not one of its values', () => {
    expect(errorCode(`map:merge(${TWO_FOOS}, map{"duplicates": "use-middle"})`)).toBe('FOJS0005');
  });

  it('rejects a duplicates option of the wrong type, and an empty options argument', () => {
    expect(errorCode(`map:merge(${TWO_FOOS}, map{"duplicates": 1})`)).toBe('XPTY0004');
    expect(errorCode(`map:merge(${TWO_FOOS}, ())`)).toBe('XPTY0004');
  });

  it('ignores options it does not know', () => {
    expect(strings(`map:merge(${TWO_FOOS}, map{"other": "x"})?foo`)).toEqual(['3']);
  });
});

describe('map:size, map:keys, map:contains and map:get', () => {
  it('give the size and keys of a map', () => {
    expect(strings('map:size(map{}), map:size(map{1: 2, "a": ()})')).toEqual(['0', '2']);
    expect(strings('sort(map:keys(map{"b": 1, "a": 2})), map:keys(map{})')).toEqual(['a', 'b']);
  });

  it('find keys as op:same-key compares them', () => {
    expect(
      strings('map:contains(map{1: "x"}, 1.0), map:contains(map{1: "x"}, "1"), map:contains(map{"a": ()}, "a")')
    ).toEqual(['true', 'false', 'true']);
    expect(strings('map:get(map{1: "x"}, 1e0), map:get(map{"a": (1, 2)}, xs:untypedAtomic("a"))')).toEqual([
      'x',
      '1',
      '2',
    ]);
  });

  it('give the empty sequence for a key the map does not have', () => {
    expect(evaluate('map:get(map{1: "x"}, 2)')).toEqual([]);
  });
});

describe('map:find', () => {
  it('finds the values of a key in maps nested within maps and arrays', () => {
    expect(strings('array:size(map:find((), 1)), array:size(map:find((1, "a"), 1))')).toEqual(['0', '0']);
    expect(strings('map:find(map{1: "x", 2: "y"}, 1)?*')).toEqual(['x']);
    expect(strings('map:find(map{"a": map{"k": 1}}, "k")?*')).toEqual(['1']);
    expect(strings('map:find([map{"k": 1}, [map{"k": 2}], 3], "k")?*')).toEqual(['1', '2']);
    expect(strings('map:find(map{"k": (1, 2)}, "k")?1')).toEqual(['1', '2']);
    const nested = 'map:find(map{"k": map{"k": 2}, "j": [map{"k": 3}]}, "k")';
    expect(strings(`array:size(${nested}), sort(${nested}?*[. instance of xs:integer])`)).toEqual(['3', '2', '3']);
  });
});

describe('map:put, map:entry and map:remove', () => {
  it('put a value at a key, replacing any there', () => {
    expect(strings('let $m := map:put(map{"a": 1}, "b", 2) return (map:size($m), $m?b)')).toEqual(['2', '2']);
    expect(strings('let $m := map:put(map{"a": 1}, "a", (3, 4)) return (map:size($m), $m?a)')).toEqual(['1', '3', '4']);
    expect(strings('map:size(map:put(map{}, "a", ())), map:contains(map:put(map{}, "a", ()), "a")')).toEqual([
      '1',
      'true',
    ]);
  });

  it('make a map of one entry', () => {
    expect(strings('let $m := map:entry("k", (1, 2)) return (map:size($m), $m?k)')).toEqual(['1', '1', '2']);
    expect(strings('map:size(map:entry(1, ()))')).toEqual(['1']);
  });

  it('remove the entries of some keys, ignoring keys the map does not have', () => {
    expect(strings('sort(map:keys(map:remove(map{"a": 1, "b": 2, "c": 3}, ("a", "c", "z"))))')).toEqual(['b']);
    expect(strings('map:size(map:remove(map{"a": 1}, ()))')).toEqual(['1']);
  });
});

describe('map:for-each', () => {
  it('applies a function to each key and value', () => {
    expect(strings('sort(map:for-each(map{"a": 1, "b": 2}, function($k, $v) { $k || $v }))')).toEqual(['a1', 'b2']);
    expect(strings('map:for-each(map{"a": (1, 2)}, function($k, $v) { count($v) })')).toEqual(['2']);
    expect(evaluate('map:for-each(map{}, concat#2)')).toEqual([]);
  });
});

describe('map:for-each with a function that pauses for a resource', () => {
  it('calls it for each entry in turn, waiting for each', async () => {
    const each = 'map:for-each(map { 1: "a", 2: "b" }, function($k, $v) { doc("u:" || $k || ".xml") || $v })';
    expect(await stringsBothWays(each)).toEqual([
      ['1a', '2b'],
      ['1a', '2b'],
    ]);
  });
});
