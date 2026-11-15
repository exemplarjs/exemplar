import { describe, expect, it } from 'vitest';
import { AttributeFlag, NameTable, NO_NAME, NO_NODE, NodeKind, TreeBuilder } from '@/index';

describe('TreeBuilder', () => {
  it('numbers nodes in document order, with their parents and ends', () => {
    const builder = new TreeBuilder();
    const names = builder.names;
    builder.startDocument('urn:doc');
    builder.startElement(names.code('a', ''));
    builder.text('x');
    builder.startElement(names.code('b', ''));
    builder.endElement();
    builder.comment('c');
    builder.endElement();
    builder.endDocument();
    expect(builder.current).toBe(NO_NODE);
    const tree = builder.finish();
    expect(tree.size).toBe(5);
    expect([...tree.kinds.subarray(0, 5)]).toEqual([
      NodeKind.DOCUMENT,
      NodeKind.ELEMENT,
      NodeKind.TEXT,
      NodeKind.ELEMENT,
      NodeKind.COMMENT,
    ]);
    expect([...tree.parents.subarray(0, 5)]).toEqual([NO_NODE, 0, 1, 1, 1]);
    expect([...tree.ends.subarray(0, 5)]).toEqual([5, 5, 3, 4, 5]);
    expect(tree.documentURI).toBe('urn:doc');
  });

  it('joins adjacent text and makes no node for empty text', () => {
    const builder = new TreeBuilder();
    builder.startDocument(null);
    builder.startElement(builder.names.code('a', ''));
    builder.text('');
    builder.text('one');
    builder.text('');
    builder.text('two');
    builder.startElement(builder.names.code('b', ''));
    builder.endElement();
    builder.text('three');
    builder.endElement();
    builder.endDocument();
    const tree = builder.finish();
    expect(tree.size).toBe(5);
    expect(tree.stringValue(2)).toBe('onetwo');
    expect(tree.stringValue(4)).toBe('three');
    expect(tree.text).toBe('onetwothree');
  });

  it('starts new text after comments and processing instructions', () => {
    const builder = new TreeBuilder();
    builder.startDocument(null);
    builder.startElement(builder.names.code('a', ''));
    builder.text('x');
    builder.comment('c');
    builder.text('y');
    builder.processingInstruction(builder.names.code('pi', ''), 'data');
    builder.text('z');
    builder.endElement();
    builder.endDocument();
    const tree = builder.finish();
    expect(tree.size).toBe(7);
    expect([2, 3, 4, 5, 6].map((node) => tree.stringValue(node))).toEqual(['x', 'c', 'y', 'data', 'z']);
    expect(tree.qName(5)?.localName).toBe('pi');
    expect(tree.nameCode(3)).toBe(NO_NAME);
  });

  it('gives attributes and namespace declarations to the element just started', () => {
    const builder = new TreeBuilder();
    const names = builder.names;
    builder.startDocument(null);
    builder.startElement(names.code('a', ''));
    builder.namespace('p', 'urn:p');
    builder.attribute(names.code('id', ''), 'x', AttributeFlag.ID);
    builder.attribute(names.code('p:ref', 'urn:p'), 'y', AttributeFlag.IDREFS);
    builder.startElement(names.code('b', ''));
    builder.attribute(names.code('id', ''), 'z', 0);
    builder.endElement();
    builder.endElement();
    builder.endDocument();
    const tree = builder.finish();
    expect(tree.attributeCount).toBe(3);
    expect([tree.firstAttribute(1), tree.attributeLimit(1), tree.firstAttribute(2), tree.attributeLimit(2)]).toEqual([
      0, 2, 2, 3,
    ]);
    expect([tree.attributeOwner(1), tree.attributeName(1).toString(), tree.attributeValue(1)]).toEqual([
      1,
      'p:ref',
      'y',
    ]);
    expect(tree.hasAttributeFlag(0, AttributeFlag.ID)).toBe(true);
    expect(tree.hasAttributeFlag(1, AttributeFlag.ID)).toBe(false);
    expect(tree.hasAttributeFlag(1, AttributeFlag.IDREFS)).toBe(true);
    expect([...tree.namespaceOwners]).toEqual([1]);
    expect([tree.namespacePrefixes[0], tree.namespaceURIs[0]]).toEqual(['p', 'urn:p']);
  });

  it('grows its arrays as nodes and attributes are added', () => {
    const builder = new TreeBuilder({ expectedNodes: 1 });
    const names = builder.names;
    builder.startDocument(null);
    builder.startElement(names.code('root', ''));
    for (let i = 0; i < 5000; i++) {
      builder.startElement(names.code('item', ''));
      builder.attribute(names.code('n', ''), String(i), 0);
      builder.text(String(i % 10));
      builder.endElement();
    }
    builder.endElement();
    builder.endDocument();
    const tree = builder.finish();
    expect(tree.size).toBe(10_002);
    expect(tree.attributeCount).toBe(5000);
    expect(tree.attributeValue(4999)).toBe('4999');
    expect(tree.attributeOwner(4999)).toBe(10_000);
    expect(tree.stringValue(10_001)).toBe('9');
    expect(tree.stringValue(1)).toHaveLength(5000);
  });

  it('adds names to a table it is given', () => {
    const names = new NameTable();
    const builder = new TreeBuilder({ names });
    expect(builder.names).toBe(names);
  });

  it('records base URIs and unparsed entities, keeping the first entity of a name', () => {
    const builder = new TreeBuilder();
    builder.startDocument(null);
    builder.setBaseURI(0, 'urn:base');
    builder.addUnparsedEntity('e', { systemId: 'urn:one', publicId: '' });
    builder.addUnparsedEntity('e', { systemId: 'urn:two', publicId: '' });
    builder.endDocument();
    const tree = builder.finish();
    expect(tree.baseURIs.get(0)).toBe('urn:base');
    expect(tree.unparsedEntities.get('e')?.systemId).toBe('urn:one');
  });

  it('refuses a second root, as a tree holds one document or element', () => {
    const builder = new TreeBuilder();
    builder.startElement(builder.names.code('r', ''));
    builder.endElement();
    expect(() => builder.startElement(builder.names.code('s', ''))).toThrow(RangeError);
    expect(() => builder.text('x')).toThrow(RangeError);
  });
});
