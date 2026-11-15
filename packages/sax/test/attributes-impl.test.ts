import { describe, expect, it } from 'vitest';
import { XMLInputFactory } from '@exemplarjs/xml';
import { type Attributes, AttributesImpl, SAXParser } from '@/index';

/** The attributes of a document's root, as the parser gives them, copied during startElement. */
function rootAttributes(xml: string): AttributesImpl {
  let copy: AttributesImpl | undefined;
  new SAXParser(new XMLInputFactory()).parse(xml, {
    startElement: (_uri, _localName, _qName, attributes: Attributes) => {
      copy ??= new AttributesImpl(attributes);
    },
  });
  return copy as AttributesImpl;
}

/** Each attribute as a line: URI, local name, qualified name, type, value and whether specified. */
function lines(attributes: Attributes): string[] {
  return Array.from(
    { length: attributes.length },
    (_, i) =>
      `${attributes.uri(i)} ${attributes.localName(i)} ${attributes.qName(i)} ${attributes.type(i)} ${attributes.value(i)} ${attributes.isSpecified(i)}`
  );
}

describe('AttributesImpl (SAX AttributesImpl, Attributes2Impl)', () => {
  it('copies the attributes it is given, with their types and whether they were specified', () => {
    const copy = rootAttributes(
      '<!DOCTYPE a [<!ATTLIST a i ID #IMPLIED d CDATA "dv">]><a xmlns:p="urn:p" p:x="1" i="k"/>'
    );
    expect(lines(copy)).toEqual(['urn:p x p:x CDATA 1 true', ' i i ID k true', ' d d CDATA dv false']);
    expect(lines(new AttributesImpl())).toEqual([]);
  });

  it('finds attributes and their values by qualified name, or by URI and local name', () => {
    const copy = rootAttributes('<a xmlns:p="urn:p" p:x="1" y="2"/>');
    expect([copy.index('p:x'), copy.index('urn:p', 'x'), copy.index('', 'y'), copy.index('z')]).toEqual([0, 0, 1, -1]);
    expect([copy.value('y'), copy.value('urn:p', 'x'), copy.value('missing')]).toEqual(['2', '1', undefined]);
  });

  it('adds, replaces and removes attributes', () => {
    const attributes = new AttributesImpl();
    attributes.addAttribute('', 'a', 'a', 'CDATA', '1');
    attributes.addAttribute('urn:p', 'b', 'p:b', 'CDATA', '2');
    attributes.setAttribute(0, '', 'c', 'c', 'ID', '3');
    attributes.removeAttribute(1);
    expect(lines(attributes)).toEqual([' c c ID 3 true']);
    attributes.clear();
    expect(attributes.length).toBe(0);
  });

  it('changes one part of an attribute at a time', () => {
    const attributes = new AttributesImpl();
    attributes.addAttribute('', 'a', 'a', 'CDATA', '1');
    attributes.setURI(0, 'urn:q');
    attributes.setLocalName(0, 'b');
    attributes.setQName(0, 'q:b');
    attributes.setType(0, 'NMTOKEN');
    attributes.setValue(0, 'v');
    attributes.setSpecified(0, false);
    expect(lines(attributes)).toEqual(['urn:q b q:b NMTOKEN v false']);
  });

  it('replaces its attributes with a copy of others', () => {
    const attributes = new AttributesImpl();
    attributes.addAttribute('', 'a', 'a', 'CDATA', '1');
    attributes.setAttributes(rootAttributes('<r x="9"/>'));
    expect(lines(attributes)).toEqual([' x x CDATA 9 true']);
  });

  it('throws a RangeError for an index it does not have', () => {
    const attributes = new AttributesImpl();
    expect(() => attributes.value(0)).toThrow(RangeError);
    expect(() => attributes.removeAttribute(0)).toThrow(RangeError);
    expect(() => attributes.setAttribute(1, '', 'a', 'a', 'CDATA', '')).toThrow(RangeError);
  });

  it('carries changed attributes through a filter to the handler', () => {
    const seen: string[][] = [];
    new SAXParser().parse('<a x="1"/>', {
      startElement: (_uri, _localName, _qName, attributes) => {
        const changed = new AttributesImpl(attributes);
        changed.setValue(0, 'changed');
        seen.push(lines(changed));
      },
    });
    expect(seen).toEqual([[' x x CDATA changed true']]);
  });
});
