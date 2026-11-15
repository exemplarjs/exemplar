import { describe, expect, it } from 'vitest';
import { strings } from '../helpers/evaluate.ts';

/** Whether a function returning `sub` is an instance of one returning `sup`, which holds when `sub` is a subtype of `sup`. */
function subtypes(pairs: readonly (readonly [sub: string, sup: string])[]): string[] {
  const tests = pairs.map(([sub, sup]) => `function() as ${sub} {()} instance of function() as ${sup}`);
  return strings(tests.join(', '));
}

describe('isSubtype', () => {
  it('lets the empty sequence and xs:error into the types that allow them', () => {
    expect(
      subtypes([
        ['empty-sequence()', 'xs:integer?'],
        ['empty-sequence()', 'xs:integer'],
        ['xs:error', 'xs:integer'],
        ['xs:error?', 'xs:integer'],
        ['xs:error?', 'empty-sequence()'],
        ['xs:integer', 'empty-sequence()'],
        ['xs:integer', 'xs:error'],
      ])
    ).toEqual(['true', 'false', 'true', 'false', 'true', 'false', 'false']);
  });

  it('compares occurrence indicators by the counts they allow', () => {
    expect(
      subtypes([
        ['xs:integer', 'xs:integer*'],
        ['xs:integer?', 'xs:integer*'],
        ['xs:integer+', 'xs:integer*'],
        ['xs:integer*', 'xs:integer+'],
        ['xs:integer+', 'xs:integer?'],
      ])
    ).toEqual(['true', 'true', 'true', 'false', 'false']);
  });
});

describe('document tests', () => {
  it('compare the element tests of document tests as subtypes', () => {
    expect(
      subtypes([
        ['document-node(element(a))', 'document-node(element(*))'],
        ['document-node(element(a, xs:untyped))', 'document-node(element(a))'],
        ['document-node(element(a))', 'document-node(element(Q{}a))'],
        ['document-node(element(*))', 'document-node(element(a))'],
        ['document-node(element(a))', 'document-node()'],
      ])
    ).toEqual(['true', 'true', 'true', 'false', 'true']);
  });
});

describe('isItemSubtype', () => {
  it('compares atomic and numeric types by derivation', () => {
    expect(
      subtypes([
        ['xs:integer', 'item()'],
        ['xs:integer', 'xs:decimal'],
        ['xs:decimal', 'xs:integer'],
        ['element()', 'xs:integer'],
        ['xs:numeric', 'xs:numeric'],
        ['xs:integer', 'xs:numeric'],
        ['xs:string', 'xs:numeric'],
        ['xs:error', 'element()'],
        ['xs:numeric', 'xs:anyAtomicType'],
        ['xs:numeric', 'xs:decimal'],
      ])
    ).toEqual(['true', 'true', 'false', 'false', 'true', 'true', 'false', 'true', 'true', 'false']);
  });

  it('compares the schema types of element and attribute tests by derivation, a nillable one only with another', () => {
    expect(
      subtypes([
        ['element(a, xs:untyped)', 'element(a)'],
        ['element(a)', 'element(a, xs:anyType)'],
        ['element(a, xs:anyType)', 'element(a)'],
        ['element(a, xs:anyType?)', 'element(a, xs:untyped?)'],
        ['element(*, xs:untyped)', 'element(a, xs:untyped)'],
        ['attribute(a)', 'attribute(a, xs:anySimpleType)'],
        ['attribute(a, xs:untypedAtomic)', 'attribute(a)'],
        ['attribute(a, xs:anyType)', 'attribute(a, xs:untypedAtomic)'],
        ['processing-instruction(p)', 'processing-instruction()'],
        ['processing-instruction(p)', 'processing-instruction(q)'],
        ['document-node(element(a))', 'document-node(element(a))'],
        ['document-node()', 'document-node(element(a))'],
      ])
    ).toEqual(['true', 'false', 'true', 'false', 'false', 'true', 'true', 'false', 'true', 'false', 'true', 'false']);
  });

  it('compares node tests by kind and name', () => {
    expect(
      subtypes([
        ['element()', 'node()'],
        ['xs:integer', 'node()'],
        ['element(a)', 'element()'],
        ['element()', 'element(a)'],
        ['element(a)', 'element(a)'],
        ['element(a)', 'element(b)'],
        ['attribute()', 'element()'],
      ])
    ).toEqual(['true', 'false', 'true', 'false', 'true', 'false', 'false']);
  });

  it('takes maps and arrays as functions of one argument', () => {
    expect(
      subtypes([
        ['map(*)', 'function(*)'],
        ['array(*)', 'function(*)'],
        ['xs:integer', 'function(*)'],
        ['function(*)', 'function() as item()*'],
        ['map(*)', 'function(xs:anyAtomicType) as item()*'],
        ['map(xs:string, xs:integer)', 'function(xs:string) as xs:integer?'],
        ['map(xs:string, xs:integer)', 'function(xs:string) as xs:integer'],
        ['map(xs:string, xs:integer+)', 'function(xs:string) as xs:integer*'],
        ['map(xs:string, xs:integer*)', 'function(xs:string) as xs:integer*'],
        ['map(xs:string, empty-sequence())', 'function(xs:string) as empty-sequence()'],
        ['array(*)', 'function(xs:integer) as item()*'],
        ['array(xs:string)', 'function(xs:integer) as xs:string'],
        ['array(xs:string)', 'function(xs:string) as item()*'],
      ])
    ).toEqual([
      'true',
      'true',
      'false',
      'false',
      'true',
      'true',
      'false',
      'true',
      'true',
      'true',
      'true',
      'true',
      'false',
    ]);
  });

  it('compares function types by arity, wider parameters and narrower results', () => {
    expect(
      subtypes([
        ['function(xs:decimal) as xs:integer', 'function(xs:integer) as xs:decimal'],
        ['function(xs:integer) as xs:integer', 'function(xs:decimal) as xs:integer'],
        ['function(xs:integer) as xs:decimal', 'function(xs:integer) as xs:integer'],
        ['function(xs:integer) as item()*', 'function() as item()*'],
        ['map(*)', 'function(*)'],
      ])
    ).toEqual(['true', 'false', 'false', 'false', 'true']);
  });

  it('compares map types by their key and value types', () => {
    expect(
      subtypes([
        ['xs:integer', 'map(*)'],
        ['map(xs:string, xs:integer)', 'map(*)'],
        ['map(*)', 'map(xs:string, item()*)'],
        ['map(xs:string, xs:integer)', 'map(xs:anyAtomicType, xs:decimal*)'],
        ['map(xs:decimal, xs:integer)', 'map(xs:integer, xs:integer)'],
        ['map(xs:string, xs:decimal)', 'map(xs:string, xs:integer)'],
      ])
    ).toEqual(['false', 'true', 'false', 'true', 'false', 'false']);
  });

  it('compares array types by their member types', () => {
    expect(
      subtypes([
        ['map(*)', 'array(*)'],
        ['array(xs:integer)', 'array(*)'],
        ['array(*)', 'array(xs:integer)'],
        ['array(xs:integer)', 'array(xs:decimal)'],
        ['array(xs:decimal)', 'array(xs:integer)'],
      ])
    ).toEqual(['false', 'true', 'false', 'true', 'false']);
  });
});
