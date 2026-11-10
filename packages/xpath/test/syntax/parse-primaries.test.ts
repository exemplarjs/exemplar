import { describe, expect, it } from 'vitest';
import { Decimal, XS } from '@exemplarjs/xdm';
import { parseXPath } from '@/internal';
import { explicit, parseCodeOf, parseErrorOf, shape } from '../helpers/syntax.ts';

describe('literals', () => {
  it('give integers, decimals, doubles and strings their exact values', () => {
    expect(shape(parseXPath('(123456789012345678901234567890, 0.1, 1e-1, "a""b")'))).toMatchObject({
      items: [
        { value: 'xs:integer 123456789012345678901234567890' },
        { value: 'xs:decimal 0.1' },
        { value: 'xs:double 0.1' },
        { value: 'xs:string a"b' },
      ],
    });
  });

  it('keep a decimal as a decimal however it is written', () => {
    const literal = parseXPath('5.');
    expect(literal.kind === 'literal' && literal.value.type).toBe(XS.decimal);
    expect(literal.kind === 'literal' && (literal.value.value as Decimal).toString()).toBe('5');
  });
});

describe('parentheses', () => {
  it('give one expression in parentheses as that expression', () => {
    expect(shape(parseXPath('((1))'))).toEqual(shape(parseXPath('1')));
  });

  it('give `()` and `(a, b)` as sequences spanning the parentheses', () => {
    expect(parseXPath('()')).toMatchObject({ kind: 'sequence', items: [], start: 0, end: 2 });
    expect(parseXPath(' (1, 2) ')).toMatchObject({ kind: 'sequence', start: 1, end: 7 });
    expect(parseXPath('1, 2')).toMatchObject({ kind: 'sequence', start: 0, end: 4 });
  });
});

describe('function calls and references', () => {
  it('read calls with arguments and placeholders', () => {
    expect(explicit('f()')).toBe('f()');
    expect(explicit('fn:concat(?, "a", ?)')).toBe('fn:concat(?, "a", ?)');
    expect(explicit('f(?a)')).toBe('f(?("a"))');
    expect(explicit('Q{u}f(1)')).toBe('Q{u}f(1)');
  });

  it('read named function references', () => {
    expect(explicit('fn:abs#1')).toBe('fn:abs#1');
    expect(explicit('abs #1')).toBe('abs#1');
    expect(parseErrorOf('abs#x')?.message).toBe('XPST0003: Expected an arity, but found "x" at line 1, column 5');
  });

  it('reject the reserved names without a prefix', () => {
    for (const name of [
      'array',
      'attribute',
      'comment',
      'document-node',
      'element',
      'empty-sequence',
      'function',
      'if',
      'item',
    ])
      expect(parseCodeOf(`a/${name}#0`)).toBe('XPST0003');
    for (const name of [
      'map',
      'namespace-node',
      'node',
      'processing-instruction',
      'schema-attribute',
      'schema-element',
      'switch',
    ])
      expect(parseCodeOf(`a/${name}#0`)).toBe('XPST0003');
    expect(parseErrorOf('switch()')?.message).toBe(
      'XPST0003: "switch" cannot name a function without a prefix at line 1, column 1'
    );
    expect(parseCodeOf('typeswitch(1)')).toBe('XPST0003');
    expect(parseCodeOf('item()')).toBe('XPST0003');
    expect(explicit('fn:if(1)')).toBe('fn:if(1)');
  });
});

describe('inline functions', () => {
  it('read parameters, types and bodies', () => {
    expect(explicit('function($a as xs:integer, $b) as item()* { $a + $b }')).toBe(
      'function($a as xs:integer, $b) as item()* { $a + $b }'
    );
    expect(explicit('function() {}')).toBe('function() { () }');
  });

  it('take `function` as a name where no inline function starts', () => {
    expect(explicit('function')).toBe('child::function');
  });
});

describe('maps and arrays', () => {
  it('read map constructors', () => {
    expect(explicit('map { "a" : 1, $k: (2, 3) }')).toBe('map { "a" : 1, $k : (2, 3) }');
    expect(explicit('map{}')).toBe('map {  }');
    expect(parseCodeOf('map{a:b}')).toBe('XPST0003');
    expect(explicit('map{a :b}')).toBe('map { child::a : child::b }');
  });

  it('read square and curly array constructors', () => {
    expect(explicit('[1, (2, 3), []]')).toBe('[1, (2, 3), []]');
    expect(explicit('array { 1, 2 }')).toBe('array { (1, 2) }');
    expect(explicit('array {}')).toBe('array { () }');
  });

  it('take `map` and `array` as names where no constructor starts', () => {
    expect(explicit('map/array')).toBe('child::map/child::array');
  });
});

describe('postfix expressions', () => {
  it('read filters, dynamic calls and lookups in any order', () => {
    expect(explicit('$f(1)[2]?a?1?(3)?*')).toBe('$f(1)[2]?("a")?(1)?(3)?*');
  });

  it('read unary lookups', () => {
    expect(explicit('?a')).toBe('?("a")');
    expect(explicit('?*')).toBe('?*');
    expect(explicit('?()')).toBe('?(())');
    expect(parseErrorOf('$m?p:a')?.message).toBe(
      'XPST0003: Expected a key after "?", but found "p:a" at line 1, column 4'
    );
  });

  it('read `.` as the context item', () => {
    expect(parseXPath('.')).toMatchObject({ kind: 'context-item', start: 0, end: 1 });
  });

  it('report an expression that is missing', () => {
    expect(parseErrorOf(')')?.message).toBe('XPST0003: Expected an expression, but found ")" at line 1, column 1');
    expect(parseErrorOf('1 + ')?.message).toBe(
      'XPST0003: Expected an expression, but found the end of the expression at line 1, column 5'
    );
    expect(parseCodeOf('$')).toBe('XPST0003');
    expect(parseCodeOf('f(1,)')).toBe('XPST0003');
  });
});
