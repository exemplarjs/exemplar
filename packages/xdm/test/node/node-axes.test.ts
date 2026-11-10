import { at, labels, parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { ANY_KIND, ANY_NAME, Axis, NO_NAME, NodeKind, type XdmNode } from '@/index';
import { nodeListOnAxis } from '@/internal';

const document = parse('<a xmlns:p="urn:p" p:x="1" y="2"><b>t</b><c/></a>');
const a = at(document, 0);
const [x, y] = a.attributes() as [XdmNode, XdmNode];
const p = a.namespaceNodes()[1] as XdmNode;
const any = { kind: ANY_KIND, name: ANY_NAME };

describe('XdmNode.axis', () => {
  it('walks the axes of tree nodes', () => {
    expect(labels(a.axis(Axis.CHILD))).toEqual(['element b', 'element c']);
    expect(labels(at(a, 0).axis(Axis.ANCESTOR))).toEqual(['element a', 'document(t)']);
    const iterator = a.axis(Axis.DESCENDANT)[Symbol.iterator]() as IterableIterator<XdmNode>;
    expect(iterator[Symbol.iterator]()).toBe(iterator);
  });

  it('gives an element its attributes and namespace nodes, and other nodes none', () => {
    expect(labels(a.axis(Axis.ATTRIBUTE))).toEqual(['attribute p:x', 'attribute y']);
    const named = { kind: NodeKind.ATTRIBUTE, name: document.tree.names.lookup('', 'y') };
    expect(labels(a.axis(Axis.ATTRIBUTE, named))).toEqual(['attribute y']);
    expect(labels(a.axis(Axis.NAMESPACE))).toEqual(['namespace xml', 'namespace p']);
    expect([...document.axis(Axis.ATTRIBUTE), ...x.axis(Axis.NAMESPACE)]).toEqual([]);
  });

  it('keeps the elements of a name, or on the attribute axis the attributes', () => {
    expect(labels(a.axis(Axis.CHILD, 'b'))).toEqual(['element b']);
    expect(labels(document.axis(Axis.DESCENDANT, { localName: 'c' }))).toEqual(['element c']);
    expect(labels(a.axis(Axis.ATTRIBUTE, 'y'))).toEqual(['attribute y']);
    expect(labels(a.axis(Axis.ATTRIBUTE, { localName: 'x', namespaceURI: 'urn:p' }))).toEqual(['attribute p:x']);
    expect([...a.axis(Axis.CHILD, 'missing'), ...a.axis(Axis.CHILD, 'y'), ...a.axis(Axis.ATTRIBUTE, 'x')]).toEqual([]);
  });

  it('runs the axes of attributes from their element', () => {
    expect(labels(x.axis(Axis.PARENT))).toEqual(['element a']);
    expect(labels(x.axis(Axis.ANCESTOR))).toEqual(['element a', 'document(t)']);
    expect(labels(x.axis(Axis.ANCESTOR_OR_SELF))).toEqual(['attribute p:x', 'element a', 'document(t)']);
    expect(labels(x.axis(Axis.FOLLOWING))).toEqual(['element b', 'text(t)', 'element c']);
    expect(labels(x.axis(Axis.PRECEDING))).toEqual([]);
    expect(labels(y.axis(Axis.SELF))).toEqual(['attribute y']);
    expect([...x.axis(Axis.CHILD), ...x.axis(Axis.FOLLOWING_SIBLING), ...x.axis(Axis.DESCENDANT)]).toEqual([]);
  });

  it('runs the axes of namespace nodes from their element', () => {
    expect(labels(p.axis(Axis.PARENT))).toEqual(['element a']);
    expect(labels(at(a, 1).namespaceNodes()[0]?.axis(Axis.PRECEDING) ?? [])).toEqual(['text(t)', 'element b']);
    expect(labels(p.axis(Axis.SELF))).toEqual(['namespace p']);
    expect(labels(p.axis(Axis.ANCESTOR_OR_SELF, { kind: NodeKind.ELEMENT, name: ANY_NAME }))).toEqual(['element a']);
  });

  it('gives an attribute or namespace node itself alone on the descendant-or-self axis', () => {
    expect(labels(y.axis(Axis.DESCENDANT_OR_SELF))).toEqual(['attribute y']);
    expect(labels(p.axis(Axis.DESCENDANT_OR_SELF))).toEqual(['namespace p']);
    expect(labels(y.axis(Axis.DESCENDANT_OR_SELF, { kind: NodeKind.ELEMENT, name: ANY_NAME }))).toEqual([]);
  });

  it('tests attribute and namespace nodes on the self axis', () => {
    const prefix = { kind: NodeKind.NAMESPACE, name: document.tree.names.lookup('', 'p') };
    expect(labels(x.axis(Axis.SELF, { kind: NodeKind.ELEMENT, name: ANY_NAME }))).toEqual([]);
    expect(labels(p.axis(Axis.SELF, { kind: NodeKind.ELEMENT, name: ANY_NAME }))).toEqual([]);
    expect(labels(p.axis(Axis.SELF, any))).toEqual(['namespace p']);
    expect(labels(a.axis(Axis.NAMESPACE, { kind: NodeKind.NAMESPACE, name: NO_NAME }))).toEqual([]);
    expect(labels(a.axis(Axis.NAMESPACE, prefix))).toEqual(['namespace p']);
  });

  it('matches a namespace node by its prefix when the table holds that name', () => {
    const named = parse('<p xmlns:p="urn:p"/>');
    const element = at(named, 0);
    const test = { kind: NodeKind.NAMESPACE, name: named.tree.names.lookup('', 'p') };
    expect(labels(element.axis(Axis.NAMESPACE, test))).toEqual(['namespace p']);
    const unprefixed = parse('<p xmlns="urn:p"/>');
    const defaultTest = { kind: NodeKind.NAMESPACE, name: unprefixed.tree.names.lookup('urn:p', 'p') };
    expect(labels(at(unprefixed, 0).axis(Axis.NAMESPACE, defaultTest))).toEqual([]);
  });

  it('matches a namespace node by its prefix even when no other name uses it', () => {
    const element = at(parse('<a xmlns:q="urn:q"/>'), 0);
    const test = { kind: NodeKind.NAMESPACE, name: element.tree.names.lookup('', 'q') };
    expect(labels(element.axis(Axis.NAMESPACE, test))).toEqual(['namespace q']);
  });

  it('matches the xml namespace node by its prefix, though no document declares it', () => {
    const element = at(parse('<a/>'), 0);
    const test = { kind: NodeKind.NAMESPACE, name: element.tree.names.lookup('', 'xml') };
    expect(labels(element.axis(Axis.NAMESPACE, test))).toEqual(['namespace xml']);
  });
});

describe('nodeListOnAxis', () => {
  it('gives every axis the nodes XdmNode.axis gives, from document, element, text, attribute and namespace nodes alike', () => {
    for (const node of [document, a, at(a, 0), at(a, 0).children()[0] as XdmNode, x, p]) {
      for (const axis of Object.values(Axis)) {
        expect(nodeListOnAxis(node, axis, any)).toEqual([...node.axis(axis, any)]);
      }
    }
  });
});
