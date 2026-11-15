import { describe, expect, it } from 'vitest';
import { errorCode, LIBRARY, strings } from '../helpers/evaluate.ts';
import { stringsBothWays } from '../helpers/resources.ts';

describe('logic and conditions', () => {
  it('combine effective boolean values, evaluating the right only when it decides', () => {
    expect(strings('true() or false(), false() or false(), true() and false(), 1 and "a"')).toEqual([
      'true',
      'false',
      'false',
      'true',
    ]);
    expect(strings('true() or error(), false() and error()')).toEqual(['true', 'false']);
    expect(errorCode('false() or error()')).toBe('FOER0000');
  });

  it('choose a branch of if by effective boolean value', () => {
    expect(strings('if (()) then 1 else 2, if ("x") then 1 else 2')).toEqual(['2', '1']);
    expect(errorCode('if ((1, 2)) then 1 else 2')).toBe('FORG0006');
  });

  it('quantify over every combination of the bindings', () => {
    expect(strings('some $a in (1, 2) satisfies $a = 2, some $a in () satisfies true()')).toEqual(['true', 'false']);
    expect(strings('every $a in (1, 2) satisfies $a > 0, every $a in () satisfies false()')).toEqual(['true', 'true']);
    expect(strings('every $a in (1, 2) satisfies $a > 1')).toEqual(['false']);
    expect(strings('some $a in (1, 2), $b in ($a + 1) satisfies $b = 3')).toEqual(['true']);
    expect(strings('every $a in (1, 2), $b in (3, 4) satisfies $a < $b')).toEqual(['true']);
  });
});

describe('logic and conditions that pause for a resource', () => {
  it('wait for the condition or the branch of if', async () => {
    expect(await stringsBothWays('if (doc("u:" || "b.xml") = 3) then "y" else "n"')).toEqual([['y'], ['y']]);
    expect(await stringsBothWays('if (true()) then doc("u:" || "b.xml")/b/string() else ()')).toEqual([['3'], ['3']]);
  });

  it('wait for each operand of and and or, the right only when it decides', async () => {
    const both = 'exists(doc("u:" || "b.xml")) and doc("u:" || "a.xml")//n = 2, doc("u:" || "b.xml") = 3 or error()';
    expect(await stringsBothWays(both)).toEqual([
      ['true', 'true'],
      ['true', 'true'],
    ]);
  });

  it('try the combinations of some and every in turn, each waiting, until one decides', async () => {
    const quantified = [
      'some $n in doc("u:" || "a.xml")//n satisfies $n = 2',
      'every $i in (1, 2) satisfies doc("u:" || $i || ".xml") = $i',
      'some $i in (1, 2) satisfies doc("u:" || $i || ".xml") = 1',
      'every $i in (1, 2), $j in doc("u:" || $i || ".xml") satisfies $j = 1',
    ].join(', ');
    expect(await stringsBothWays(quantified)).toEqual([
      ['true', 'true', 'true', 'false'],
      ['true', 'true', 'true', 'false'],
    ]);
  });
});

describe('effective boolean values of operands', () => {
  it('read as few items as decide them', () => {
    expect(strings('if ((//book, error())) then 1 else 2, (//book, error()) and true()', LIBRARY)).toEqual([
      '1',
      'true',
    ]);
    expect(strings('some $book in (//book, error()) satisfies $book/@id = "b1"', LIBRARY)).toEqual(['true']);
    expect(errorCode('if ((1, 2)) then 1 else 2')).toBe('FORG0006');
    expect(strings('if ((//book)[@id = "none"]) then 1 else 2, every $n in () satisfies false()', LIBRARY)).toEqual([
      '2',
      'true',
    ]);
  });
});
