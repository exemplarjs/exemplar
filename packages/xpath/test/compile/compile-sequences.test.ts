import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, LIBRARY, strings } from '../helpers/evaluate.ts';
import { stringsBothWays } from '../helpers/resources.ts';

describe('literals and sequences', () => {
  it('give literals their exact types', () => {
    expect(evaluate('(1, 1.5, 1e0, "a")')).toEqual(['xs:integer 1', 'xs:decimal 1.5', 'xs:double 1', 'xs:string a']);
    expect(evaluate('()')).toEqual([]);
    expect(evaluate('((1, 2), (), 3)')).toEqual(['xs:integer 1', 'xs:integer 2', 'xs:integer 3']);
  });

  it('give the context item for `.`, raising XPDY0002 without one', () => {
    expect(evaluate('.', LIBRARY)).toEqual(['document']);
    expect(errorCode('.')).toBe('XPDY0002');
  });
});

describe('predicates and filters', () => {
  it('keep items by position for a number and by effective boolean value otherwise', () => {
    expect(strings('(5, 6, 7)[2]')).toEqual(['6']);
    expect(strings('(5, 6, 7)[2.0]')).toEqual(['6']);
    expect(strings('(5, 6, 7)[xs:double(3)]')).toEqual(['7']);
    expect(strings('(5, 6, 7)[2.5]')).toEqual([]);
    expect(strings('(5, 6, 7)[0]')).toEqual([]);
    expect(strings('(5, 6, 7)[4]')).toEqual([]);
    expect(strings('(5, 6, 7)[. > 5]')).toEqual(['6', '7']);
    expect(strings('(5, 6, 7)[position() = last()]')).toEqual(['7']);
    expect(strings('(5, 6, 7)[1 + 1]')).toEqual(['6']);
    expect(strings('("", "a")["x"]')).toEqual(['', 'a']);
  });

  it('keep the item at a position a decimal predicate equals exactly, as eq compares them', () => {
    const near = '2.0000000000000000001';
    expect(strings(`count((1, 2, 3)[${near}]), count((1, 2, 3)[xs:decimal("${near}") + 0])`)).toEqual(['0', '0']);
    expect(strings(`let $p := ${near} return count((1, 2, 3)[$p])`)).toEqual(['0']);
    expect(strings('(1, 2, 3)[2.0], (1, 2, 3)[xs:decimal("3") + 0], let $p := 1.0 return (4, 5)[$p]')).toEqual([
      '2',
      '3',
      '4',
    ]);
  });

  it('apply each predicate in turn', () => {
    expect(strings('(1 to 10)[. mod 2 = 0][2]')).toEqual(['4']);
  });

  it('keep items by a predicate that reads no focus, as by any other', () => {
    const bound = (body: string) =>
      `let $s := (5, 6, 7), $i := 2, $t := true(), $f := 0.0, $x := "x", $y := "" return (${body})`;
    expect(strings(bound('$s[$i], $s[$i + 1], $s[($i)], $s[-$i], $s[$i * 2]'))).toEqual(['6', '7', '6']);
    expect(
      strings(
        bound('$s[$t], $s[$x], count($s[$f]), count($s[$y]), count($s[$i div 4]), count($s[xs:double("NaN") + $i])')
      )
    ).toEqual(['5', '6', '7', '5', '6', '7', '0', '0', '0', '0']);
    expect(strings(bound('$s[last()], $s[$i][1], ()[1 div 0]'))).toEqual(['7', '6']);
    expect(errorCode(bound('$s[1 div 0]'))).toBe('FOAR0001');
    expect(errorCode(bound('$s[($i, $i)]'))).toBe('FORG0006');
    expect(strings('for $i in 1 to 3 return (4, 5, 6)[$i]')).toEqual(['4', '5', '6']);
  });
});

describe('simple map, ranges and concatenation', () => {
  it('evaluate the right of `!` for each item of the left, in order', () => {
    expect(strings('(3, 1, 2) ! (. * 10)')).toEqual(['30', '10', '20']);
    expect(strings('(1, 2) ! position()')).toEqual(['1', '2']);
  });

  it('make ranges of integers', () => {
    expect(strings('1 to 3')).toEqual(['1', '2', '3']);
    expect(strings('3 to 1')).toEqual([]);
    expect(strings('() to 3')).toEqual([]);
    expect(strings('1 to ()')).toEqual([]);
    expect(strings('xs:untypedAtomic("2") to 3')).toEqual(['2', '3']);
    expect(errorCode('1.5 to 3')).toBe('XPTY0004');
    expect(errorCode('(1, 2) to 3')).toBe('XPTY0004');
    expect(errorCode('1 to 100000000')).toBe('XPDY0130');
  });

  it('concatenate strings with ||', () => {
    expect(strings('"a" || 1 || () || 2.5')).toEqual(['a12.5']);
    expect(errorCode('(1, 2) || "a"')).toBe('XPTY0004');
  });
});

describe('set operations', () => {
  it('combine nodes in document order without duplicates', () => {
    expect(strings('(//book[2], //book[1], //book[1]) / @id', LIBRARY)).toEqual(['b1', 'b2']);
    expect(strings('(//book[2] | //book[1])/@id', LIBRARY)).toEqual(['b1', 'b2']);
    expect(strings('(//book intersect //book[2])/@id', LIBRARY)).toEqual(['b2']);
    expect(strings('(//book except //book[2])/@id', LIBRARY)).toEqual(['b1']);
    expect(strings('(//* except //book)/name()', LIBRARY)).toEqual([
      'library',
      'dc:title',
      'price',
      'dc:title',
      'price',
    ]);
  });

  it('take nodes only', () => {
    expect(errorCode('1 union //book', LIBRARY)).toBe('XPTY0004');
  });
});

describe('filters and maps that pause for a resource', () => {
  it('wait for the base and the predicate of a filter, and for each item of a simple map', async () => {
    const filtered = [
      '(doc("u:" || "a.xml")//n)[2]/string()',
      '(1, 2)[doc("u:" || . || ".xml") = 2]',
      '(1, 2) ! doc("u:" || . || ".xml")/x/string()',
    ].join(', ');
    expect(await stringsBothWays(filtered)).toEqual([
      ['2', '2', '1', '2'],
      ['2', '2', '1', '2'],
    ]);
  });
});

describe('filters and sequences as streams', () => {
  it('stop at an item by position, and filter as they read', () => {
    expect(strings('exists((//book, error())[1]), head((//book, error())[@id])/@id', LIBRARY)).toEqual(['true', 'b1']);
    expect(strings('(//book)[0], (//book)[3], ((//book)[@id = "b2"])[1]/@id', LIBRARY)).toEqual(['b2']);
    expect(strings('let $first := /library/book[1] return count((//book)[$first/@id])', LIBRARY)).toEqual(['2']);
  });

  it('wait for an item of a sequence that pauses', async () => {
    expect(await stringsBothWays('exists((doc("u:" || "a.xml")//n, 1))')).toEqual([['true'], ['true']]);
  });
});
