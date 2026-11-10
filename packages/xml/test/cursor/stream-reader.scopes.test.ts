import { cursor } from '@test/helpers/parse';
import { describe, expect, it } from 'vitest';
import { EventType, XMLInputFactory } from '@/index';
import { ANCESTOR_XML_ATTRIBUTES, NAMESPACES_IN_SCOPE, READER_OPTIONS } from '@/internal';

describe('the hooks consumers given a reader use', () => {
  it('give the options the reader reads with', () => {
    const options = cursor('<a/>', { coalescing: true })[READER_OPTIONS];
    expect([options.coalescing, options.namespaceAware]).toEqual([true, true]);
  });

  it('give the namespace bindings in scope at the current element, the innermost of each prefix winning', () => {
    const reader = cursor('<a xmlns="urn:d" xmlns:p="urn:p"><b xmlns:p="urn:q" xmlns:r="urn:r"><c xmlns=""/></b></a>');
    const scopes: [string, string][][] = [];
    for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
      if (type === EventType.START_ELEMENT) scopes.push([...reader[NAMESPACES_IN_SCOPE]()]);
    }
    expect(scopes).toEqual([
      [
        ['', 'urn:d'],
        ['p', 'urn:p'],
      ],
      [
        ['', 'urn:d'],
        ['p', 'urn:q'],
        ['r', 'urn:r'],
      ],
      [
        ['', ''],
        ['p', 'urn:q'],
        ['r', 'urn:r'],
      ],
    ]);
  });

  it("give the xml: attributes of each start tag's ancestors, outermost first, forgetting those of ended elements", () => {
    const reader = cursor(
      '<!DOCTYPE a [<!ATTLIST c xml:space CDATA "preserve">]>' +
        '<a xml:lang="en" xml:base="http://e.org/"><b xml:id="b1" xml:lang="fr"><i/></b><c><d xml:lang=" de "/></c><e/></a>'
    );
    const inherited: Record<string, [string, string][]> = {};
    for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
      if (type === EventType.START_ELEMENT) inherited[reader.localName()] = [...reader[ANCESTOR_XML_ATTRIBUTES]()];
    }
    const a: [string, string][] = [
      ['xml:lang', 'en'],
      ['xml:base', 'http://e.org/'],
    ];
    expect(inherited).toEqual({
      a: [],
      b: a,
      i: [...a, ['xml:lang', 'fr'], ['xml:id', 'b1']],
      c: a,
      d: [...a, ['xml:space', 'preserve']],
      e: a,
    });
    expect(reader[ANCESTOR_XML_ATTRIBUTES]()).toEqual([]);
  });

  it('give no namespace bindings with namespaces off', () => {
    const reader = new XMLInputFactory({ namespaceAware: false }).createStreamReader('<a xmlns:p="urn:p"/>');
    reader.next();
    expect(reader[NAMESPACES_IN_SCOPE]().size).toBe(0);
  });
});
