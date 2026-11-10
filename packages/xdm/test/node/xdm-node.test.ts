import { at, label, labels, parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { NodeKind, TreeBuilder, XdmNode } from '@/index';

const DOC = `<!DOCTYPE r [
<!ATTLIST item id ID #IMPLIED ref IDREF #IMPLIED refs IDREFS #IMPLIED>
<!NOTATION gif SYSTEM "image/gif">
<!ENTITY logo SYSTEM "logo.gif" NDATA gif>
<!ENTITY pic PUBLIC "-//pic//EN" "pic.gif" NDATA gif>
]>
<!--first--><r xmlns="urn:r" xmlns:p="urn:p"><item id="a" p:x="1">one</item><?pi data?><item ref="a" refs="a b">two</item></r>`;

const document = parse({ systemId: 'http://example.com/doc.xml', text: DOC });
const root = at(document, 0);
const [first, second] = [at(root, 0), at(root, 1)];

describe('XdmNode', () => {
  it('gives each kind of node its kind and name', () => {
    const [comment] = document.children();
    const pi = root.children()[1] as XdmNode;
    const text = first.children()[0] as XdmNode;
    const attribute = first.attributes()[0] as XdmNode;
    const namespace = root.namespaceNodes()[2] as XdmNode;
    const nodes = [document, comment as XdmNode, root, pi, text, attribute, namespace];
    expect(nodes.map((node) => node.kindName)).toEqual([
      'document',
      'comment',
      'element',
      'processing-instruction',
      'text',
      'attribute',
      'namespace',
    ]);
    expect(nodes.map((node) => node.nodeName?.toString() ?? null)).toEqual([null, null, 'r', 'pi', null, 'id', 'p']);
    expect([root.localName, root.namespaceURI, document.localName, document.namespaceURI]).toEqual([
      'r',
      'urn:r',
      '',
      '',
    ]);
    expect((root.namespaceNodes()[1] as XdmNode).nodeName).toBeNull();
  });

  it('gives string values', () => {
    expect(document.stringValue).toBe('onetwo');
    expect(first.attributes().map((attribute) => attribute.stringValue)).toEqual(['a', '1']);
    expect((root.children()[1] as XdmNode).stringValue).toBe('data');
    expect((root.namespaceNodes()[1] as XdmNode).stringValue).toBe('urn:r');
  });

  it('finds parents and roots, an attribute or namespace node belonging to its element', () => {
    const attribute = first.attributes()[1] as XdmNode;
    const namespace = first.namespaceNodes()[0] as XdmNode;
    expect(attribute.parent?.isSameNode(first)).toBe(true);
    expect(namespace.parent?.isSameNode(first)).toBe(true);
    expect(first.parent?.isSameNode(root)).toBe(true);
    expect(document.parent).toBeNull();
    expect(attribute.root.isSameNode(document)).toBe(true);
    expect(namespace.root.kind).toBe(NodeKind.DOCUMENT);
  });

  it('gives base and document URIs', () => {
    expect([document.documentURI, root.documentURI]).toEqual(['http://example.com/doc.xml', null]);
    expect([first.baseURI, (first.attributes()[0] as XdmNode).baseURI]).toEqual([
      'http://example.com/doc.xml',
      'http://example.com/doc.xml',
    ]);
    expect((root.namespaceNodes()[0] as XdmNode).baseURI).toBeNull();
  });

  it('says which attributes are IDs and ID references', () => {
    const [id, x] = first.attributes() as [XdmNode, XdmNode];
    const [ref, refs] = second.attributes() as [XdmNode, XdmNode];
    expect([id.isId, x.isId, ref.isId, first.isId]).toEqual([true, false, false, false]);
    expect([ref.isIdrefs, refs.isIdrefs, id.isIdrefs, first.isIdrefs]).toEqual([true, true, false, false]);
  });

  it('gives the untyped type names and nilled property', () => {
    const text = first.children()[0] as XdmNode;
    const attribute = first.attributes()[0] as XdmNode;
    expect([root.typeName?.localName, attribute.typeName?.localName, text.typeName?.localName]).toEqual([
      'untyped',
      'untypedAtomic',
      'untypedAtomic',
    ]);
    expect(root.typeName?.namespaceURI).toBe('http://www.w3.org/2001/XMLSchema');
    expect([document.typeName, root.nilled, document.nilled]).toEqual([null, false, null]);
  });

  it('lists children, attributes and namespace nodes', () => {
    expect(labels(document.children())).toEqual(['comment(first)', 'element r']);
    expect(labels(root.children())).toEqual(['element item', 'processing-instruction pi', 'element item']);
    expect(labels(first.attributes())).toEqual(['attribute id', 'attribute p:x']);
    expect(labels(first.namespaceNodes())).toEqual(['namespace xml', 'namespace(urn:r)', 'namespace p']);
    const attribute = first.attributes()[0] as XdmNode;
    expect([attribute.children(), attribute.attributes(), attribute.namespaceNodes()]).toEqual([[], [], []]);
    expect((root.namespaceNodes()[0] as XdmNode).children()).toEqual([]);
  });

  it('reads attribute values by name, or by namespace and local name', () => {
    expect([first.attribute('id'), first.attribute('x', 'urn:p')]).toEqual(['a', '1']);
    expect([first.attribute('x'), first.attribute('missing'), document.attribute('id')]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('finds elements by ID', () => {
    expect(document.elementById('a')?.isSameNode(first)).toBe(true);
    expect(second.elementById('a')?.isSameNode(first)).toBe(true);
    expect(document.elementById('b')).toBeNull();
  });

  it('gives the unparsed entities of its document', () => {
    expect(root.unparsedEntitySystemId('logo')).toBe('http://example.com/logo.gif');
    expect([root.unparsedEntityPublicId('logo'), root.unparsedEntityPublicId('pic')]).toEqual([null, '-//pic//EN']);
    expect([root.unparsedEntitySystemId('none'), root.unparsedEntityPublicId('none')]).toEqual([null, null]);
  });

  it('compares nodes by identity and document order', () => {
    const again = XdmNode.of(document.tree, first.index);
    expect(again).not.toBe(first);
    expect(again.isSameNode(first)).toBe(true);
    expect(first.compareOrder(second)).toBeLessThan(0);
    expect(second.compareOrder(first)).toBeGreaterThan(0);
  });

  it('views a parentless element', () => {
    const builder = new TreeBuilder();
    builder.startElement(builder.names.code('lone', ''));
    builder.endElement();
    const lone = XdmNode.of(builder.finish(), 0);
    expect([label(lone), lone.parent, lone.root.isSameNode(lone)]).toEqual(['element lone', null, true]);
  });
});
