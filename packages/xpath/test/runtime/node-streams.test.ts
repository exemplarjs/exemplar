import { describe, expect, it } from 'vitest';
import { ANY_NAME, Axis, axisIterator, NodeKind, type XdmNode } from '@exemplarjs/xdm';
import { allItems } from '@/runtime/item-streams';
import { AttributeStream, AxisStream, FilteredStream, NumberStream } from '@/runtime/node-streams';
import { parse } from '../helpers/evaluate.ts';

const document = parse('<r a="1" b="2"><x c="3"/><y/><x d="4"/></r>');
const tree = document.tree;
const ELEMENTS = { kind: NodeKind.ELEMENT, name: ANY_NAME };
const ATTRIBUTES = { kind: NodeKind.ATTRIBUTE, name: ANY_NAME };
const names = (nodes: readonly unknown[]) => nodes.map((node) => (node as XdmNode).nodeName?.localName);

describe('axis streams', () => {
  it('make the nodes an axis gives as they are read, and count the rest without making them', () => {
    const stream = new AxisStream(tree, axisIterator(tree, 0, Axis.DESCENDANT, ELEMENTS));
    expect(names([stream.next()])).toEqual(['r']);
    expect(stream.count()).toBe(3);
  });
});

describe('number streams', () => {
  it('make the nodes of node numbers as they are read, and count the rest', () => {
    const stream = new NumberStream(tree, [1, 2]);
    expect(names([stream.next()])).toEqual(['r']);
    expect([stream.count(), stream.next(), stream.count()]).toEqual([1, undefined, 0]);
  });
});

describe('attribute streams', () => {
  const all = [tree.firstAttribute(0), tree.firstAttribute(tree.end(0))];

  it('give the attributes of runs that pass a test, and count them, all or by the test', () => {
    const every = new AttributeStream(tree, all, ATTRIBUTES);
    expect(names(allItems(every))).toEqual(['a', 'b', 'c', 'd']);
    const named = { kind: NodeKind.ATTRIBUTE, name: tree.names.lookup('', 'c') };
    const onlyC = new AttributeStream(tree, all, named);
    expect(names(allItems(onlyC))).toEqual(['c']);
    expect(new AttributeStream(tree, all, named).count()).toBe(1);
    const stream = new AttributeStream(tree, [all[0] as number, 1, 2, 4], ATTRIBUTES);
    expect(names([stream.next()])).toEqual(['a']);
    expect(stream.count()).toBe(2);
  });

  it('give nothing for no runs', () => {
    expect([
      new AttributeStream(tree, [], ATTRIBUTES).next(),
      new AttributeStream(tree, [], ATTRIBUTES).count(),
    ]).toEqual([undefined, 0]);
  });
});

describe('filtered streams', () => {
  it('give the items that pass a test', () => {
    const elements = new AxisStream(tree, axisIterator(tree, 0, Axis.DESCENDANT, ELEMENTS));
    const xs = new FilteredStream(elements, (item) => (item as XdmNode).nodeName?.localName === 'x');
    expect(names(allItems(xs))).toEqual(['x', 'x']);
  });
});
