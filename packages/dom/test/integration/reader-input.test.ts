import { DOCUMENTS } from '@test/helpers/documents';
import { streamOf, utf8 } from '@test/helpers/dom';
import { describe, expect, it } from 'vitest';
import { EventType, type StreamReader, XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader, StreamReaderDelegate } from '@exemplarjs/xml/filters';
import { type Attr, type Document, DocumentBuilder, type Element, type Node, NodeType } from '@/index';

const XMLNS = 'http://www.w3.org/2000/xmlns/';
const factory = new XMLInputFactory();
const builder = new DocumentBuilder(factory);

/** A node and everything below it as lines: type, names and value, and an element's attributes sorted; `xmlns` ones left out on request. */
function dump(node: Node, withDeclarations = true, depth = 0): string[] {
  const indent = ' '.repeat(depth);
  let line = `${indent}${node.nodeType} {${node.namespaceURI ?? ''}}${node.nodeName} ${JSON.stringify(node.nodeValue)}`;
  if (node.nodeType === NodeType.ELEMENT_NODE) {
    const attributes = ([...(node as Element).attributes] as Attr[])
      .filter((attr) => withDeclarations || attr.namespaceURI !== XMLNS)
      .map((attr) => `{${attr.namespaceURI ?? ''}}${attr.name}=${attr.value}`);
    line += ` [${attributes.toSorted().join(' ')}]`;
  }
  const lines = [line];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    lines.push(...dump(child, withDeclarations, depth + 1));
  }
  return lines;
}

/** What a document says of itself, then its nodes. */
function described(document: Document): string[] {
  return [
    `${document.xmlVersion} ${document.xmlStandalone} ${document.xmlEncoding} ${document.inputEncoding}`,
    ...dump(document),
  ];
}

/** A cursor over a document, moved to its start tag number `index`, counting from 0. */
function readerAt(xml: string, index: number): StreamReader {
  const reader = factory.createStreamReader(xml);
  let seen = -1;
  while (reader.next() !== EventType.START_ELEMENT || ++seen < index);
  return reader;
}

describe('DocumentBuilder: building from a reader agrees with building from a source', () => {
  it.each(Object.entries(DOCUMENTS))('through a cursor, a delegate and a filter: %s', (_name, xml) => {
    const expected = described(builder.parse(xml));
    const readers = [
      factory.createStreamReader(xml),
      new StreamReaderDelegate(factory.createStreamReader(xml)),
      createFilteredReader(factory.createStreamReader(xml), () => true),
    ];
    for (const reader of readers) expect(described(builder.parse(reader))).toEqual(expected);
  });

  it.each(Object.entries(DOCUMENTS))('one element at a time, with the namespaces it inherits: %s', (_name, xml) => {
    const elements = [...builder.parse(xml).getElementsByTagName('*')];
    for (const [index, element] of elements.entries()) {
      const record = builder.parse(readerAt(xml, index)).documentElement as Element;
      expect(dump(record, false)).toEqual(dump(element, false));
      for (const prefix of [null, 'p', 'q']) {
        expect(record.lookupNamespaceURI(prefix), `${prefix}`).toBe(element.lookupNamespaceURI(prefix));
      }
    }
  });

  it.each(Object.entries(DOCUMENTS))(
    'from an asynchronous cursor over a stream in small chunks: %s',
    async (_name, xml) => {
      const reader = factory.createAsyncStreamReader(streamOf(utf8(xml), 3));
      expect(dump(await builder.parseAsync(reader))).toEqual(dump(builder.parse(xml)));
    }
  );
});
