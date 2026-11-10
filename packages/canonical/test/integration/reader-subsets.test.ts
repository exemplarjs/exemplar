import { tree } from '@test/helpers/c14n';
import { describe, expect, it } from 'vitest';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader, StreamReaderDelegate } from '@exemplarjs/xml/filters';
import { canonicalize, type CanonicalMethod } from '@/index';

/** Documents whose elements inherit namespaces, undeclarations and `xml:` attributes in different ways. */
const DOCUMENTS = [
  '<a xmlns:p="urn:p" xml:lang="en" xml:base="http://e.org/x/"><b xml:space="preserve" xmlns="urn:d"><p:c xml:base="y/">t</p:c></b><d/></a>',
  '<r xmlns="urn:d" xml:id="r1"><s xmlns=""><t xml:lang="fr"><u xml:base="../z" xml:lang="de">x</u></t></s><v xml:base="w/"/></r>',
  '<!DOCTYPE r [<!ATTLIST s xml:space (default|preserve) "preserve">]><r xml:base="http://e.org/a/b"><s><t/></s><s xml:space="default"><t/></s></r>',
  '<r xmlns:a="urn:a"><s xmlns:a="urn:b" xmlns:c="urn:c"><a:t c:u="1"><x/></a:t></s></r>',
];

const METHODS: CanonicalMethod[] = ['c14n', 'c14n11', 'exc-c14n'];

/** The canonical form of each element in a document, read from a cursor that stands at it. */
function fromReader(xml: string, method: CanonicalMethod): string[] {
  const forms: string[] = [];
  for (let index = 0; ; index++) {
    const reader = new XMLInputFactory().createStreamReader(xml);
    let seen = -1;
    for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
      if (type === EventType.START_ELEMENT && ++seen === index) break;
    }
    if (reader.eventType() === EventType.END_DOCUMENT) return forms;
    forms.push(canonicalize(reader, { method }));
  }
}

/** The canonical form of each element in a document, as a DOM node. */
function fromTree(xml: string, method: CanonicalMethod): string[] {
  const elements = [...tree(xml).getElementsByTagName('*')];
  return elements.map((element) => canonicalize(element, { method }));
}

describe('an element canonicalized from a reader is the same document subset as from a tree', () => {
  it.each(DOCUMENTS)('for every element of %s', (xml) => {
    for (const method of METHODS) expect(fromReader(xml, method), method).toEqual(fromTree(xml, method));
  });

  it('through a delegate and a filter', () => {
    const xml = DOCUMENTS[0] as string;
    const reader = createFilteredReader(
      new StreamReaderDelegate(new XMLInputFactory().createStreamReader(xml)),
      () => true
    );
    while (reader.next() !== EventType.START_ELEMENT || reader.localName() !== 'b');
    expect(canonicalize(reader)).toBe(fromTree(xml, 'c14n')[1]);
  });
});
