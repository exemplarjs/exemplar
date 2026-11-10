import { at, parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import {
  itemMatches,
  type ItemType,
  matchesSequenceType,
  NodeKind,
  Occurrence,
  sequenceType,
  TreeBuilder,
  XdmAtomicValue,
  XdmMap,
  XdmNode,
  XS,
} from '@/index';

const document = parse('<r xmlns:p="urn:p"><p:a x="1"/><?go now?>text</r>');
const root = at(document, 0);
const [a, pi, text] = root.children() as [ReturnType<typeof at>, ReturnType<typeof at>, ReturnType<typeof at>];
const attribute = a.attributes()[0] as ReturnType<typeof at>;

describe('itemMatches', () => {
  it('matches atomic values by type and the types they derive from', () => {
    const integerType: ItemType = { kind: 'atomic', type: XS.integer };
    expect([
      itemMatches(XdmAtomicValue.integer(1n, XS.byte), integerType),
      itemMatches(XdmAtomicValue.double(1), integerType),
    ]).toEqual([true, false]);
    expect(itemMatches(a, integerType)).toBe(false);
    expect(itemMatches(XdmAtomicValue.string('s'), { kind: 'atomic', type: XS.anyAtomicType })).toBe(true);
  });

  it('matches nodes by kind and name', () => {
    expect(itemMatches(a, { kind: 'node' })).toBe(true);
    expect(itemMatches(XdmAtomicValue.integer(1n), { kind: 'node' })).toBe(false);
    expect(itemMatches(a, { kind: 'node', nodeKind: NodeKind.ELEMENT, name: new QName('urn:p', 'a') })).toBe(true);
    expect(itemMatches(a, { kind: 'node', nodeKind: NodeKind.ELEMENT, name: new QName('', 'a') })).toBe(false);
    expect(itemMatches(a, { kind: 'node', nodeKind: NodeKind.ELEMENT, name: new QName('urn:p', 'b') })).toBe(false);
    expect(itemMatches(attribute, { kind: 'node', nodeKind: NodeKind.ATTRIBUTE, name: new QName('', 'x') })).toBe(true);
    expect(
      itemMatches(pi, { kind: 'node', nodeKind: NodeKind.PROCESSING_INSTRUCTION, name: new QName('', 'go') })
    ).toBe(true);
    expect(itemMatches(text, { kind: 'node', nodeKind: NodeKind.ELEMENT })).toBe(false);
    expect(itemMatches(text, { kind: 'any-item' })).toBe(true);
    expect(itemMatches(XdmMap.EMPTY, { kind: 'node' })).toBe(false);
  });
});

describe('itemMatches with document-node(element(name))', () => {
  it('matches a document by the name of its document element', () => {
    const rooted = parse('<?pi?><r xmlns="urn:r"/>');
    const test = (name: QName): boolean => itemMatches(rooted, { kind: 'node', nodeKind: NodeKind.DOCUMENT, name });
    expect([test(new QName('urn:r', 'r')), test(new QName('', 'r'))]).toEqual([true, false]);
  });

  it('matches only a document with one element child and no text', () => {
    const built = (...children: ('element' | 'text')[]): XdmNode => {
      const builder = new TreeBuilder();
      builder.startDocument(null);
      for (const child of children) {
        if (child === 'text') builder.text('t');
        else {
          builder.startElement(builder.names.code('r', ''));
          builder.endElement();
        }
      }
      builder.endDocument();
      return XdmNode.of(builder.finish(), 0);
    };
    const test = { kind: 'node', nodeKind: NodeKind.DOCUMENT, name: new QName('', 'r') } as const;
    expect([itemMatches(built('element'), test), itemMatches(built('element', 'element'), test)]).toEqual([
      true,
      false,
    ]);
    expect([itemMatches(built('text', 'element'), test), itemMatches(built(), test)]).toEqual([false, false]);
  });
});

describe('matchesSequenceType', () => {
  const integers = (occurrence: Occurrence): ReturnType<typeof sequenceType> =>
    sequenceType({ kind: 'atomic', type: XS.integer }, occurrence);
  const one = [XdmAtomicValue.integer(1n)];
  const two = [XdmAtomicValue.integer(1n), XdmAtomicValue.integer(2n)];

  it('checks how many items there are', () => {
    expect([[], one, two].map((value) => matchesSequenceType(value, integers(Occurrence.EXACTLY_ONE)))).toEqual([
      false,
      true,
      false,
    ]);
    expect([[], one, two].map((value) => matchesSequenceType(value, integers(Occurrence.ZERO_OR_ONE)))).toEqual([
      true,
      true,
      false,
    ]);
    expect([[], one, two].map((value) => matchesSequenceType(value, integers(Occurrence.ZERO_OR_MORE)))).toEqual([
      true,
      true,
      true,
    ]);
    expect([[], one, two].map((value) => matchesSequenceType(value, integers(Occurrence.ONE_OR_MORE)))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('checks every item, and matches empty-sequence() to the empty sequence only', () => {
    expect(
      matchesSequenceType([XdmAtomicValue.integer(1n), XdmAtomicValue.string('2')], integers(Occurrence.ZERO_OR_MORE))
    ).toBe(false);
    expect([matchesSequenceType([], { kind: 'empty' }), matchesSequenceType(one, { kind: 'empty' })]).toEqual([
      true,
      false,
    ]);
  });
});
