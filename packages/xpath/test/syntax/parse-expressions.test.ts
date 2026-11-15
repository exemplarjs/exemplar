import { describe, expect, it } from 'vitest';
import { explicit, parseCodeOf, parseErrorOf } from '../helpers/syntax.ts';

describe('operators', () => {
  it('bind by XPath precedence, loosest first', () => {
    expect(explicit('1, 2 or 3 and 4 = 5 || 6 to 7 + 8 * 9 | 10 intersect 11 instance of item()')).toBe(
      '(1, (2 or (3 and (4 = (5 || (6 to (7 + (8 * (9 union (10 intersect (11 instance of item())))))))))))'
    );
    expect(explicit('$a castable as xs:boolean treat as item()')).toBe('($a castable as xs:boolean) treat as item()');
    expect(parseCodeOf('$a treat as item() castable as xs:boolean')).toBe('XPST0003');
  });

  it('chain left to right where they chain', () => {
    expect(explicit('1 - 2 - 3')).toBe('(1 - 2) - 3');
    expect(explicit('1 div 2 idiv 3 mod 4 * 5')).toBe('(((1 div 2) idiv 3) mod 4) * 5');
    expect(explicit('$a or $b or $c')).toBe('($a or $b) or $c');
    expect(explicit('$a and $b and $c')).toBe('($a and $b) and $c');
    expect(explicit('$a || $b || $c')).toBe('($a || $b) || $c');
    expect(explicit('$a union $b | $c')).toBe('($a union $b) union $c');
    expect(explicit('$a intersect $b except $c')).toBe('($a intersect $b) except $c');
    expect(explicit('$a ! $b ! $c')).toBe('($a ! $b) ! $c');
  });

  it('read every comparison, by symbol and by keyword', () => {
    for (const operator of ['=', '!=', '<', '<=', '>', '>=', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'is', '<<', '>>'])
      expect(explicit(`$a ${operator} $b`)).toBe(`$a ${operator} $b`);
  });

  it('do not chain comparisons or ranges', () => {
    expect(parseCodeOf('1 = 2 = 3')).toBe('XPST0003');
    expect(parseCodeOf('1 to 2 to 3')).toBe('XPST0003');
    expect(parseCodeOf('1 cast as xs:integer cast as xs:string')).toBe('XPST0003');
  });

  it('take keywords as operators only where an operator can go', () => {
    expect(explicit('div div div')).toBe('child::div div child::div');
    expect(explicit('and and or')).toBe('child::and and child::or');
    expect(explicit('to to to')).toBe('child::to to child::to');
    // `div:b` is a prefixed name, so no operator follows `$a`.
    expect(parseCodeOf('$a div:b')).toBe('XPST0003');
  });

  it('take `*` as multiplication after an operand and as a wildcard before one', () => {
    expect(explicit('* * *')).toBe('child::* * child::*');
    expect(explicit('2*3')).toBe('2 * 3');
  });

  it('read signs, any number of them, binding more loosely than `!` and more tightly than `=>`', () => {
    expect(explicit('--1')).toBe('-(-1)');
    expect(explicit('+-$a')).toBe('+(-$a)');
    expect(explicit('-$a!$b')).toBe('-($a ! $b)');
    expect(explicit('-1 => abs()')).toBe('(-1) => abs()');
    expect(explicit('1 - -1')).toBe('1 - (-1)');
  });

  it('read instance of, treat as, castable as and cast as', () => {
    expect(explicit('$a instance of xs:integer+')).toBe('$a instance of xs:integer+');
    expect(explicit('$a treat as item()*')).toBe('$a treat as item()*');
    expect(explicit('$a castable as xs:integer?')).toBe('$a castable as xs:integer?');
    expect(explicit('$a cast as xs:integer')).toBe('$a cast as xs:integer');
    expect(explicit('$a cast as xs:integer castable as xs:boolean')).toBe(
      '($a cast as xs:integer) castable as xs:boolean'
    );
  });

  it('bind an occurrence indicator to the type before it', () => {
    expect(explicit('4 treat as item() + - 5')).toBe('(4 treat as item()+) - 5');
    expect(parseCodeOf('$a instance of xs:integer * 2')).toBe('XPST0003');
  });

  it('read arrows to named functions, variables and parenthesized expressions', () => {
    expect(explicit('$a => f(1) => g()')).toBe('($a => f(1)) => g()');
    expect(explicit('$a => $f(?)')).toBe('$a => ($f)(?)');
    expect(explicit('$a => (f#2)(1)')).toBe('$a => (f#2)(1)');
    expect(explicit('$a => Q{u}f()')).toBe('$a => Q{u}f()');
    expect(parseErrorOf('$a => 1()')?.message).toBe(
      'XPST0003: Expected a function name, a variable or a parenthesized expression after "=>", but found "1" at line 1, column 7'
    );
  });
});

describe('for, let, some, every and if', () => {
  it('read for and let with any number of bindings', () => {
    expect(explicit('for $a in 1 to 3, $b in $a return $a + $b')).toBe('for $a in (1 to 3), $b in $a return ($a + $b)');
    expect(explicit('let $a := 1, $ b := $a return $b')).toBe('let $a := 1, $b := $a return $b');
  });

  it('read some and every', () => {
    expect(explicit('some $a in (1, 2) satisfies $a = 2')).toBe('some $a in (1, 2) satisfies ($a = 2)');
    expect(explicit('every $a in 1, $b in 2 satisfies true()')).toBe('every $a in 1, $b in 2 satisfies true()');
  });

  it('read if with a sequence as its condition', () => {
    expect(explicit('if (1, 2) then 3 else 4')).toBe('if ((1, 2)) then 3 else 4');
  });

  it('take the keywords as names where no expression of theirs starts', () => {
    expect(explicit('for')).toBe('child::for');
    expect(explicit('let/some/every')).toBe('child::let/child::some/child::every');
    expect(explicit('if')).toBe('child::if');
  });

  it('report a missing part', () => {
    expect(parseErrorOf('for $a in 1 $a')?.message).toBe(
      'XPST0003: Expected "return", but found "$" at line 1, column 13'
    );
    expect(parseErrorOf('let $a = 1 return $a')?.message).toBe(
      'XPST0003: Expected ":=", but found "=" at line 1, column 8'
    );
    expect(parseErrorOf('some $a in 1 return 1')?.message).toBe(
      'XPST0003: Expected "satisfies", but found "return" at line 1, column 14'
    );
    expect(parseErrorOf('if (1) 2 else 3')?.message).toBe(
      'XPST0003: Expected "then", but found "2" at line 1, column 8'
    );
    expect(parseErrorOf('for $1 in 1 return 1')?.message).toBe(
      'XPST0003: Expected a variable name, but found "1" at line 1, column 6'
    );
  });
});
