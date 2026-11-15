import { describe, expect, it } from 'vitest';
import { defineFunction, sequenceTypeOf } from '@/functions/signatures';
import { ANY_SEQUENCE, NONE } from '@/static/matchers';

describe('defineFunction', () => {
  const implementation = (): never[] => [];

  it('reads the name, the parameter types and whether the last repeats', () => {
    const concat = defineFunction('fn:concat($a as xs:anyAtomicType?, ...) as xs:string', implementation);
    expect([concat.localName, concat.parameterTypes.map((type) => type.text), concat.variadic]).toEqual([
      'concat',
      ['xs:anyAtomicType?'],
      true,
    ]);
    expect(defineFunction('math:pi() as xs:double', implementation).namespaceURI).toBe(
      'http://www.w3.org/2005/xpath-functions/math'
    );
  });

  it('gives item()* when no result type is written, and none for a function that never returns', () => {
    expect(defineFunction('f($a as item())', implementation).returnType).toBe(ANY_SEQUENCE);
    expect(defineFunction('fn:error() as none', implementation).returnType).toBe(NONE);
  });
});

describe('sequenceTypeOf', () => {
  it('compiles a sequence type with the standard prefixes', () => {
    expect(sequenceTypeOf('map(xs:string, xs:integer*)').text).toBe('map(xs:string, xs:integer*)');
  });
});
