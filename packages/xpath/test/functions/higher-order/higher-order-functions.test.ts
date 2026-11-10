import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';
import { stringsBothWays } from '../../helpers/resources.ts';

const CASE_BLIND = '"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"';

describe('function-lookup', () => {
  it('gives the function a name and an arity identify', () => {
    expect(strings('function-lookup(xs:QName("fn:concat"), 2)("a", "b")')).toEqual(['ab']);
    expect(evaluate('function-lookup(xs:QName("fn:abs"), 1)')).toEqual(['function fn:abs#1']);
  });

  it('gives the empty sequence for an unknown name or arity', () => {
    expect(evaluate('function-lookup(xs:QName("fn:no-such-function"), 1)')).toEqual([]);
    expect(evaluate('function-lookup(xs:QName("fn:abs"), 2)')).toEqual([]);
  });
});

describe('function-name and function-arity', () => {
  it('give the name of a named function', () => {
    expect(
      strings('local-name-from-QName(function-name(abs#1)), namespace-uri-from-QName(function-name(abs#1))')
    ).toEqual(['abs', 'http://www.w3.org/2005/xpath-functions']);
  });

  it('give no name for an anonymous function', () => {
    expect(evaluate('function-name(function($x) { $x })')).toEqual([]);
  });

  it('give the arity of named and anonymous functions', () => {
    expect(strings('function-arity(concat#3), function-arity(function($a, $b) { $a }), function-arity(map{})')).toEqual(
      ['3', '2', '1']
    );
  });
});

describe('for-each and filter', () => {
  it('apply a function to each item in order', () => {
    expect(strings('for-each(1 to 3, function($x) { $x * 2 })')).toEqual(['2', '4', '6']);
    expect(strings('for-each((1, 2), function($x) { ($x, $x) })')).toEqual(['1', '1', '2', '2']);
    expect(evaluate('for-each((), abs#1)')).toEqual([]);
  });

  it('keep the items the predicate is true for', () => {
    expect(strings('filter(1 to 6, function($x) { $x mod 2 = 0 })')).toEqual(['2', '4', '6']);
    expect(evaluate('filter((), boolean#1)')).toEqual([]);
  });

  it('reject a predicate that does not give a boolean', () => {
    expect(errorCode('filter(1 to 3, function($x) { 1 })')).toBe('XPTY0004');
  });
});

describe('fold-left and fold-right', () => {
  it('fold from the first item', () => {
    expect(strings('fold-left((2, 3, 5, 7), 1, function($a, $b) { $a * $b })')).toEqual(['210']);
    expect(strings('fold-left(1 to 3, "", function($a, $b) { concat("f(", $a, ",", $b, ")") })')).toEqual([
      'f(f(f(,1),2),3)',
    ]);
  });

  it('fold from the last item', () => {
    expect(strings('fold-right(1 to 3, "", function($a, $b) { concat("f(", $a, ",", $b, ")") })')).toEqual([
      'f(1,f(2,f(3,)))',
    ]);
  });

  it('give the zero value for no items', () => {
    expect(strings('fold-left((), "zero", concat#2), fold-right((), "zero", concat#2)')).toEqual(['zero', 'zero']);
    expect(evaluate('fold-left((), (), concat#2)')).toEqual([]);
  });
});

describe('for-each-pair', () => {
  it('applies a function to items at the same positions, as far as the shorter sequence', () => {
    expect(strings('for-each-pair(("a", "b", "c"), ("x", "y"), concat#2)')).toEqual(['ax', 'by']);
    expect(strings('for-each-pair((1, 2), (10, 20, 30), function($a, $b) { $a + $b })')).toEqual(['11', '22']);
    expect(evaluate('for-each-pair((), (1, 2), concat#2)')).toEqual([]);
  });
});

describe('apply', () => {
  it('calls a function with the members of an array as its arguments', () => {
    expect(strings('apply(concat#3, ["a", "b", "c"])')).toEqual(['abc']);
    expect(strings('apply(function() { 42 }, [])')).toEqual(['42']);
    expect(strings('apply(count#1, [(1, 2, 3)])')).toEqual(['3']);
  });

  it('rejects an array with the wrong number of members', () => {
    expect(errorCode('apply(concat#3, ["a", "b"])')).toBe('FOAP0001');
    expect(errorCode('apply(abs#1, [])')).toBe('FOAP0001');
  });

  it('rejects an argument that is not an array', () => {
    expect(errorCode('apply(abs#1, 1)')).toBe('XPTY0004');
  });
});

describe('sort', () => {
  it('sorts atomized items in ascending order', () => {
    expect(strings('sort((3, 1, 2)), sort(("b", "a", "B"))')).toEqual(['1', '2', '3', 'B', 'a', 'b']);
    expect(evaluate('sort(())')).toEqual([]);
  });

  it('sorts strings by a collation', () => {
    expect(strings(`sort(("b", "C", "a"), ${CASE_BLIND})`)).toEqual(['a', 'b', 'C']);
    expect(strings('sort(("b", "C", "a"), ())')).toEqual(['C', 'a', 'b']);
  });

  it('sorts by the keys a function gives', () => {
    expect(strings('sort((1, -3, 2), (), abs#1)')).toEqual(['1', '2', '-3']);
    expect(strings(`sort(("b", "C", "a"), ${CASE_BLIND}, string#1)`)).toEqual(['a', 'b', 'C']);
  });

  it('rejects an unknown collation', () => {
    expect(errorCode('sort(("a", "b"), "http://example.com/no-such-collation")')).toBe('FOCH0002');
  });
});

describe('higher-order functions whose function pauses for a resource', () => {
  it('call it for each item in turn, waiting for each', async () => {
    const read = 'function($i) { doc("u:" || $i || ".xml")/x/string() }';
    const calls = [
      `for-each((1, 2), ${read})`,
      `filter((1, 2), function($i) { doc("u:" || $i || ".xml") = 2 })`,
      `fold-left((1, 2), "", function($all, $i) { $all || ${read}($i) })`,
      `fold-right((1, 2), "", function($i, $all) { $all || ${read}($i) })`,
      `for-each-pair((1, 2), (2, 1), function($a, $b) { ${read}($a) || ${read}($b) })`,
      `sort((2, 1), (), ${read})`,
      `apply(${read}, [2])`,
    ].join(', ');
    expect(await stringsBothWays(calls)).toEqual([
      ['1', '2', '2', '12', '21', '12', '21', '1', '2', '2'],
      ['1', '2', '2', '12', '21', '12', '21', '1', '2', '2'],
    ]);
  });

  it('fold, waiting at each step for the function to read its document first', async () => {
    const read = 'doc("u:" || $i || ".xml")/x/string()';
    expect(await stringsBothWays(`fold-left((1, 2), "", function($all, $i) { $all || ${read} })`)).toEqual([
      ['12'],
      ['12'],
    ]);
    expect(await stringsBothWays(`fold-right((1, 2), "", function($i, $all) { $all || ${read} })`)).toEqual([
      ['21'],
      ['21'],
    ]);
  });
});
