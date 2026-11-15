import { parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { NO_NODE, NodeKind, type Tree, TreeBuilder } from '@/index';

/** `<a x="1"><b>one</b>two<c><d/></c><!--note--></a>`, numbered 0 (document) to 7 (comment). */
function sample(): Tree {
  return parse('<a x="1"><b>one</b>two<c><d/></c><!--note--></a>').tree;
}

describe('Tree', () => {
  it('numbers trees in the order they were made', () => {
    const first = sample();
    expect(sample().number).toBeGreaterThan(first.number);
  });

  it('finds children and siblings by arithmetic', () => {
    const tree = sample();
    expect([tree.firstChild(1), tree.lastChild(1)]).toEqual([2, 7]);
    expect([tree.nextSibling(2), tree.nextSibling(4), tree.nextSibling(5), tree.nextSibling(7)]).toEqual([
      4,
      5,
      7,
      NO_NODE,
    ]);
    expect([tree.previousSibling(7), tree.previousSibling(5), tree.previousSibling(2)]).toEqual([5, 4, NO_NODE]);
    expect([tree.firstChild(3), tree.lastChild(6), tree.nextSibling(0), tree.previousSibling(0)]).toEqual([
      NO_NODE,
      NO_NODE,
      NO_NODE,
      NO_NODE,
    ]);
  });

  it('finds parents, roots, depths and descendants', () => {
    const tree = sample();
    expect([tree.parent(6), tree.parent(0)]).toEqual([5, NO_NODE]);
    expect([tree.root(6), tree.root(0)]).toEqual([0, 0]);
    expect([tree.depth(0), tree.depth(1), tree.depth(6)]).toEqual([0, 1, 3]);
    expect([tree.isDescendant(6, 1), tree.isDescendant(1, 1), tree.isDescendant(7, 5)]).toEqual([true, false, false]);
    expect([tree.end(1), tree.end(5)]).toEqual([8, 7]);
  });

  it('gives string values: the text inside, or a comment or instruction content', () => {
    const tree = sample();
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((node) => tree.stringValue(node))).toEqual([
      'onetwo',
      'onetwo',
      'one',
      'one',
      'two',
      '',
      '',
      'note',
    ]);
    expect(tree.kind(7)).toBe(NodeKind.COMMENT);
  });

  it('names elements and processing instructions only', () => {
    const tree = parse('<a><?p d?>t</a>').tree;
    expect([tree.qName(1)?.localName, tree.qName(2)?.localName, tree.qName(3), tree.qName(0)]).toEqual([
      'a',
      'p',
      null,
      null,
    ]);
  });

  it('finds attributes by expanded name', () => {
    const tree = parse('<a xmlns:p="urn:p" x="1" p:y="2"><b/></a>').tree;
    expect(tree.findAttribute(1, tree.names.lookup('urn:p', 'y'))).toBe(1);
    expect(tree.findAttribute(1, tree.names.lookup('', 'x'))).toBe(0);
    expect(tree.findAttribute(2, tree.names.lookup('', 'x'))).toBe(NO_NODE);
  });

  it('finds namespace declarations by element', () => {
    const tree = parse('<a xmlns="urn:a"><b xmlns:p="urn:p" xmlns:q="urn:q"/><c/><d xmlns="urn:d"/></a>').tree;
    expect([0, 1, 2, 3, 4, 5].map((node) => tree.firstDeclaration(node))).toEqual([0, 0, 1, 3, 3, 4]);
  });

  it('finds elements by ID, the first one when several share it', () => {
    const tree = parse(
      '<!DOCTYPE a [<!ATTLIST b id ID #IMPLIED>]><a><b id="x"/><c xml:id="y"/><b id="x"/><d id="z"/></a>'
    ).tree;
    expect([tree.elementById('x'), tree.elementById('y'), tree.elementById('z')]).toEqual([2, 3, NO_NODE]);
    expect(tree.elementById('x')).toBe(2);
  });

  it('may be a single parentless element', () => {
    const builder = new TreeBuilder();
    builder.startElement(builder.names.code('a', ''));
    builder.text('hi');
    builder.endElement();
    const tree = builder.finish();
    expect([tree.root(1), tree.parent(0), tree.nextSibling(0), tree.stringValue(0)]).toEqual([
      0,
      NO_NODE,
      NO_NODE,
      'hi',
    ]);
  });
});
