import { describe, expect, it } from 'vitest';
import { explicit, parseCodeOf, parseErrorOf } from '../helpers/syntax.ts';

/** A sequence type parsed in an `instance of` and printed back. */
function type(text: string): string {
  return explicit(`. instance of ${text}`).slice('. instance of '.length);
}

describe('sequence types', () => {
  it('read empty-sequence() and occurrence indicators', () => {
    expect(type('empty-sequence()')).toBe('empty-sequence()');
    expect(type('xs:integer')).toBe('xs:integer');
    expect(type('xs:integer?')).toBe('xs:integer?');
    expect(type('xs:integer*')).toBe('xs:integer*');
    expect(type('xs:integer+')).toBe('xs:integer+');
  });

  it('read item(), atomic types and parenthesized item types', () => {
    expect(type('item()+')).toBe('item()+');
    expect(type('Q{http://www.w3.org/2001/XMLSchema}string')).toBe('Q{http://www.w3.org/2001/XMLSchema}string');
    expect(type('((xs:string))?')).toBe('xs:string?');
  });

  it('read function, map and array tests', () => {
    expect(type('function(*)')).toBe('function(*)');
    expect(type('function() as item()')).toBe('(function() as item())');
    expect(type('function(xs:string, node()*) as xs:boolean*')).toBe('(function(xs:string, node()*) as xs:boolean*)');
    expect(type('(function() as xs:string)?')).toBe('(function() as xs:string)?');
    expect(type('map(*)')).toBe('map(*)');
    expect(type('map(xs:string, item()*)')).toBe('map(xs:string, item()*)');
    expect(type('array(*)')).toBe('array(*)');
    expect(type('array(xs:integer+)')).toBe('array(xs:integer+)');
  });

  it('read every kind test', () => {
    const tests = ['node()', 'text()', 'comment()', 'namespace-node()', 'document-node()', 'element()', 'attribute()'];
    for (const test of tests) expect(type(test)).toBe(test);
    expect(type('document-node(element(a))')).toBe('document-node(element(a))');
    expect(type('document-node(schema-element(a))')).toBe('document-node(schema-element(a))');
    expect(type('schema-element(p:a)')).toBe('schema-element(p:a)');
    expect(type('schema-attribute(a)')).toBe('schema-attribute(a)');
  });

  it('read element and attribute tests with names, wildcards and types', () => {
    expect(type('element(*)')).toBe('element()');
    expect(type('element(a)')).toBe('element(a)');
    expect(type('element(*, xs:anyType)')).toBe('element(*, xs:anyType)');
    expect(type('element(a, xs:anyType?)')).toBe('element(a, xs:anyType?)');
    expect(type('attribute(*)')).toBe('attribute()');
    expect(type('attribute(a, xs:string)')).toBe('attribute(a, xs:string)');
    expect(type('attribute(*, xs:string)')).toBe('attribute(*, xs:string)');
  });

  it('read processing-instruction tests, a string target whitespace-normalized', () => {
    expect(type('processing-instruction()')).toBe('processing-instruction()');
    expect(type('processing-instruction(pi)')).toBe('processing-instruction(pi)');
    expect(type('processing-instruction(" pi ")')).toBe('processing-instruction(pi)');
    expect(parseErrorOf('processing-instruction("1pi")')?.message).toBe(
      'XPTY0004: "1pi" is not a valid processing instruction target at line 1, column 24'
    );
    expect(parseCodeOf('processing-instruction(p:pi)')).toBe('XPST0003');
  });

  it('read single types with an optional `?`', () => {
    expect(explicit('$a cast as Q{u}t?')).toBe('$a cast as Q{u}t?');
  });

  it('report a malformed type', () => {
    expect(parseErrorOf('. instance of 1')?.message).toBe(
      'XPST0003: Expected a type, but found "1" at line 1, column 15'
    );
    expect(parseCodeOf('. instance of empty-sequence(1)')).toBe('XPST0003');
    expect(parseCodeOf('. instance of function(xs:string)')).toBe('XPST0003');
    expect(parseCodeOf('. instance of map(xs:string)')).toBe('XPST0003');
    expect(parseCodeOf('. instance of element(a, *)')).toBe('XPST0003');
    expect(parseCodeOf('. instance of document-node(text())')).toBe('XPST0003');
    expect(parseCodeOf('. instance of (xs:string')).toBe('XPST0003');
  });
});
