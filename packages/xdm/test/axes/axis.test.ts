import { parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { attributePasses } from '@/axes/axis';
import {
  ANY_KIND,
  ANY_NAME,
  Axis,
  axisIterator,
  NO_NAME,
  NO_NODE,
  type NodeIterator,
  NodeKind,
  nodesAfter,
} from '@/index';

/** The node numbers an iterator gives. */
function numbers(iterator: NodeIterator): number[] {
  const found: number[] = [];
  for (let node = iterator.next(); node !== NO_NODE; node = iterator.next()) found.push(node);
  expect(iterator.next()).toBe(NO_NODE);
  return found;
}

// 0 document, 1 a, 2 b, 3 "one", 4 c, 5 d, 6 "two", 7 e, 8 <?p?>, 9 f
const tree = parse('<a><b>one</b><c><d>two</d><e/></c><?p x?><f/></a>').tree;

describe('axisIterator', () => {
  it('walks the forward axes in document order', () => {
    expect(numbers(axisIterator(tree, 1, Axis.CHILD))).toEqual([2, 4, 8, 9]);
    expect(numbers(axisIterator(tree, 4, Axis.DESCENDANT))).toEqual([5, 6, 7]);
    expect(numbers(axisIterator(tree, 4, Axis.DESCENDANT_OR_SELF))).toEqual([4, 5, 6, 7]);
    expect(numbers(axisIterator(tree, 4, Axis.FOLLOWING_SIBLING))).toEqual([8, 9]);
    expect(numbers(axisIterator(tree, 5, Axis.FOLLOWING))).toEqual([7, 8, 9]);
    expect(numbers(axisIterator(tree, 4, Axis.SELF))).toEqual([4]);
    expect(numbers(axisIterator(tree, 4, Axis.PARENT))).toEqual([1]);
  });

  it('walks the reverse axes nearest first', () => {
    expect(numbers(axisIterator(tree, 6, Axis.ANCESTOR))).toEqual([5, 4, 1, 0]);
    expect(numbers(axisIterator(tree, 6, Axis.ANCESTOR_OR_SELF))).toEqual([6, 5, 4, 1, 0]);
    expect(numbers(axisIterator(tree, 8, Axis.PRECEDING_SIBLING))).toEqual([4, 2]);
    expect(numbers(axisIterator(tree, 7, Axis.PRECEDING))).toEqual([6, 5, 3, 2]);
  });

  it('gives nothing past the edges of the tree', () => {
    expect(numbers(axisIterator(tree, 0, Axis.PARENT))).toEqual([]);
    expect(numbers(axisIterator(tree, 0, Axis.FOLLOWING_SIBLING))).toEqual([]);
    expect(numbers(axisIterator(tree, 0, Axis.PRECEDING_SIBLING))).toEqual([]);
    expect(numbers(axisIterator(tree, 3, Axis.CHILD))).toEqual([]);
    expect(numbers(axisIterator(tree, 2, Axis.PRECEDING_SIBLING))).toEqual([]);
  });

  it('leaves the attribute and namespace axes to their own tables', () => {
    expect(numbers(axisIterator(tree, 1, Axis.ATTRIBUTE))).toEqual([]);
    expect(numbers(axisIterator(tree, 1, Axis.NAMESPACE))).toEqual([]);
  });

  it('keeps the nodes a test passes', () => {
    const elements = { kind: NodeKind.ELEMENT, name: ANY_NAME };
    const text = { kind: NodeKind.TEXT, name: ANY_NAME };
    const d = { kind: NodeKind.ELEMENT, name: tree.names.lookup('', 'd') };
    const p = { kind: NodeKind.PROCESSING_INSTRUCTION, name: tree.names.lookup('', 'p') };
    expect(numbers(axisIterator(tree, 0, Axis.DESCENDANT, elements))).toEqual([1, 2, 4, 5, 7, 9]);
    expect(numbers(axisIterator(tree, 0, Axis.DESCENDANT, text))).toEqual([3, 6]);
    expect(numbers(axisIterator(tree, 0, Axis.DESCENDANT, d))).toEqual([5]);
    expect(numbers(axisIterator(tree, 1, Axis.CHILD, p))).toEqual([8]);
    const b = { kind: ANY_KIND, name: tree.names.lookup('', 'b') };
    expect(numbers(axisIterator(tree, 0, Axis.DESCENDANT, b))).toEqual([2]);
    expect(numbers(axisIterator(tree, 0, Axis.DESCENDANT, { kind: NodeKind.ELEMENT, name: NO_NAME }))).toEqual([]);
    expect(numbers(axisIterator(tree, 8, Axis.PRECEDING_SIBLING, elements))).toEqual([4, 2]);
    expect(numbers(axisIterator(tree, 9, Axis.PRECEDING_SIBLING, p))).toEqual([8]);
    expect(numbers(axisIterator(tree, 6, Axis.ANCESTOR, d))).toEqual([5]);
    expect(numbers(axisIterator(tree, 9, Axis.PRECEDING, text))).toEqual([6, 3]);
    expect(numbers(axisIterator(tree, 9, Axis.PRECEDING, { kind: ANY_KIND, name: d.name }))).toEqual([5]);
  });
});

describe('axisIterator with names several prefixes share', () => {
  const prefixed = parse('<r xmlns:a="urn:x" xmlns:b="urn:x"><a:i/><b:i/><i/><?i?></r>').tree;

  it('compares expanded names', () => {
    const name = prefixed.names.lookup('urn:x', 'i');
    expect(numbers(axisIterator(prefixed, 1, Axis.CHILD, { kind: NodeKind.ELEMENT, name }))).toEqual([2, 3]);
    expect(numbers(axisIterator(prefixed, 1, Axis.CHILD, { kind: ANY_KIND, name }))).toEqual([2, 3]);
  });

  it('matches elements and processing instructions by a name with one code', () => {
    const name = prefixed.names.lookup('', 'i');
    expect(numbers(axisIterator(prefixed, 1, Axis.CHILD, { kind: ANY_KIND, name }))).toEqual([4, 5]);
  });
});

describe('nodesAfter', () => {
  it('gives the nodes after a node, its descendants first', () => {
    expect(numbers(nodesAfter(tree, 4))).toEqual([5, 6, 7, 8, 9]);
  });
});

describe('attributePasses', () => {
  const attributes = parse('<a x="1" y="2"/>').tree;

  it('passes attributes for the attribute kind or any kind, by name', () => {
    const x = attributes.names.lookup('', 'x');
    expect(attributePasses(attributes, 0, { kind: NodeKind.ATTRIBUTE, name: x })).toBe(true);
    expect(attributePasses(attributes, 1, { kind: NodeKind.ATTRIBUTE, name: x })).toBe(false);
    expect(attributePasses(attributes, 1, { kind: ANY_KIND, name: ANY_NAME })).toBe(true);
    expect(attributePasses(attributes, 0, { kind: NodeKind.ELEMENT, name: ANY_NAME })).toBe(false);
  });
});
