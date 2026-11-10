import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import { itemTypeToString, NodeKind, Occurrence, sequenceType, sequenceTypeToString, XS } from '@/index';

describe('sequence types', () => {
  it('writes item types as XPath does', () => {
    expect(itemTypeToString({ kind: 'any-item' })).toBe('item()');
    expect(itemTypeToString({ kind: 'atomic', type: XS.integer })).toBe('xs:integer');
    expect(itemTypeToString({ kind: 'node' })).toBe('node()');
    expect(itemTypeToString({ kind: 'node', nodeKind: NodeKind.ELEMENT, name: new QName('', 'title') })).toBe(
      'element(title)'
    );
    expect(itemTypeToString({ kind: 'node', nodeKind: NodeKind.DOCUMENT })).toBe('document-node()');
    expect(itemTypeToString({ kind: 'node', nodeKind: NodeKind.PROCESSING_INSTRUCTION })).toBe(
      'processing-instruction()'
    );
  });

  it('writes namespace and named document tests as XPath does', () => {
    expect(itemTypeToString({ kind: 'node', nodeKind: NodeKind.NAMESPACE })).toBe('namespace-node()');
    expect(itemTypeToString({ kind: 'node', nodeKind: NodeKind.DOCUMENT, name: new QName('', 'a') })).toBe(
      'document-node(element(a))'
    );
  });

  it('writes sequence types with their occurrence indicators', () => {
    expect(sequenceTypeToString({ kind: 'empty' })).toBe('empty-sequence()');
    expect(sequenceTypeToString(sequenceType({ kind: 'atomic', type: XS.string }, Occurrence.ZERO_OR_ONE))).toBe(
      'xs:string?'
    );
    expect(sequenceTypeToString(sequenceType({ kind: 'node' }))).toBe('node()');
  });
});
