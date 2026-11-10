import { streamOf } from '@test/helpers/resolver';
import { at, labels } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { EventType, InvalidArgumentError, type Source, XMLError, XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader, StreamReaderDelegate } from '@exemplarjs/xml/filters';
import { NodeKind, XdmDocumentBuilder } from '@/index';

/** A delegate that upper-cases text. */
class Upper extends StreamReaderDelegate {
  override text(): string {
    return super.text().toUpperCase();
  }
}

describe('XdmDocumentBuilder', () => {
  it('parses a document into a tree and returns its document node', () => {
    const document = new XdmDocumentBuilder().parse('<list><item>one</item><item>two</item></list>');
    expect(document.kind).toBe(NodeKind.DOCUMENT);
    expect(document.stringValue).toBe('onetwo');
    expect(labels(at(document, 0).children())).toEqual(['element item', 'element item']);
  });

  it('reads bytes, and source objects with a system id', () => {
    const builder = new XdmDocumentBuilder();
    expect(builder.parse(new TextEncoder().encode('<a>é</a>')).stringValue).toBe('é');
    const document = builder.parse({ systemId: 'http://example.com/d.xml', text: '<a/>' });
    expect([document.documentURI, document.baseURI]).toEqual(['http://example.com/d.xml', 'http://example.com/d.xml']);
    expect(builder.parse({ bytes: new TextEncoder().encode('<b/>') }).documentURI).toBeNull();
    // A caller without types may pass the field undefined.
    expect(builder.parse({ text: '<c/>', systemId: undefined } as unknown as Source).documentURI).toBeNull();
  });

  it('parses streams, awaiting input as it arrives', async () => {
    const text = `<a>${'<b x="1">text</b>'.repeat(200)}</a>`;
    const document = await new XdmDocumentBuilder().parseAsync(streamOf(text, 7));
    expect(at(document, 0).children()).toHaveLength(200);
    expect(document.stringValue).toBe('text'.repeat(200));
  });

  it('parses strings asynchronously too', async () => {
    const document = await new XdmDocumentBuilder().parseAsync('<a>x</a>');
    expect(document.stringValue).toBe('x');
  });

  it('parses a fragment, the content of an element, into a document of its nodes', () => {
    const document = new XdmDocumentBuilder().parseFragment('one<a/><!--c--><b>two</b>', 'http://example.org/');
    expect(document.kind).toBe(NodeKind.DOCUMENT);
    expect(labels(document.children())).toEqual(['text(one)', 'element a', 'comment(c)', 'element b']);
    expect(document.stringValue).toBe('onetwo');
    expect(document.baseURI).toBe('http://example.org/');
    expect(document.documentURI).toBeNull();
    expect([...new XdmDocumentBuilder().parseFragment('').children()]).toEqual([]);
    expect(() => new XdmDocumentBuilder().parseFragment('<a>')).toThrow(XMLError);
  });

  it('throws the reader errors for documents that are not well-formed', () => {
    expect(() => new XdmDocumentBuilder().parse('<a><b></a>')).toThrow(XMLError);
  });

  it('shares names between the trees it builds, up to a bound', () => {
    const builder = new XdmDocumentBuilder();
    const first = builder.parse('<a/>');
    expect(builder.parse('<a/>').tree.names).toBe(first.tree.names);
    const many = Array.from({ length: 70_000 }, (_, i) => `<n${i}/>`).join('');
    expect(builder.parse(`<r>${many}</r>`).tree.names).toBe(first.tree.names);
    expect(builder.parse('<a/>').tree.names).not.toBe(first.tree.names);
  });

  it('leaves whitespace outside the document element out, whatever the factory reports', () => {
    const builder = new XdmDocumentBuilder(new XMLInputFactory({ reportPrologWhitespace: true }));
    const document = builder.parse('<?xml version="1.0"?>\n<!--c-->\n<a/>\n');
    expect(document.children().map((child) => child.kindName)).toEqual(['comment', 'element']);
    expect(document.stringValue).toBe('');
  });

  it('builds a whole document from a reader at its start, through its filters and delegates', () => {
    const factory = new XMLInputFactory();
    const reader = createFilteredReader(
      new Upper(factory.createStreamReader({ systemId: 'http://example.com/d.xml', text: '<a>x<!--c--></a>' })),
      (r) => r.eventType() !== EventType.COMMENT
    );
    const document = new XdmDocumentBuilder().parse(reader);
    expect(labels(at(document, 0).children())).toEqual(['text(X)']);
    expect([document.documentURI, document.baseURI]).toEqual(['http://example.com/d.xml', 'http://example.com/d.xml']);
  });

  it('builds an element from a reader at its start tag, with the namespaces it inherits, leaving the reader at its end', () => {
    const factory = new XMLInputFactory();
    const reader = factory.createStreamReader({
      systemId: 'http://example.com/feed.xml',
      text: '<feed xmlns="urn:f" xmlns:p="urn:p"><p:entry n="1">one</p:entry><p:entry n="2"/></feed>',
    });
    reader.nextTag();
    const builder = new XdmDocumentBuilder();
    const entries: string[] = [];
    while (reader.nextTag() === EventType.START_ELEMENT) {
      const document = builder.parse(reader);
      const entry = at(document, 0);
      const prefixes = entry
        .namespaceNodes()
        .map((namespace) => namespace.localName)
        .toSorted();
      entries.push(`${entry.nodeName?.toString()} ${entry.namespaceURI} ${prefixes.join(',')} ${document.stringValue}`);
      expect([document.documentURI, document.baseURI]).toEqual([null, 'http://example.com/feed.xml']);
      expect([reader.eventType(), reader.localName()]).toEqual([EventType.END_ELEMENT, 'entry']);
    }
    expect(entries).toEqual(['p:entry urn:p ,p,xml one', 'p:entry urn:p ,p,xml ']);
  });

  it('builds from an asynchronous reader, awaiting input as it arrives', async () => {
    const reader = new XMLInputFactory().createAsyncStreamReader(streamOf('<a><b>x</b><b>y</b></a>', 3));
    const document = await new XdmDocumentBuilder().parseAsync(new Upper(reader));
    expect(document.stringValue).toBe('XY');
  });

  it('refuses a reader without namespaces, or that reports namespace declarations as attributes or leaves entities unexpanded', () => {
    const builder = new XdmDocumentBuilder();
    for (const options of [
      { namespaceAware: false },
      { namespacePrefixes: true },
      { replaceEntityReferences: false },
    ]) {
      const reader = new XMLInputFactory(options).createStreamReader('<a/>');
      expect(() => builder.parse(reader)).toThrow(InvalidArgumentError);
    }
  });

  it('refuses a factory without namespaces up front, which a tree cannot be built with', () => {
    expect(() => new XdmDocumentBuilder(new XMLInputFactory({ namespaceAware: false }))).toThrow(
      new InvalidArgumentError('XdmDocumentBuilder needs a factory with namespaceAware: true')
    );
  });

  it('fails on a reader whose filter leaves its elements unbalanced', () => {
    const reader = createFilteredReader(
      new XMLInputFactory().createStreamReader('<a><b/></a>'),
      (r) => r.eventType() !== EventType.START_ELEMENT || r.localName() !== 'b'
    );
    expect(() => new XdmDocumentBuilder().parse(reader)).toThrow(
      expect.objectContaining({ code: 'WF_END_TAG_MISMATCH' })
    );
  });

  it('stops telling its loader about a reader’s entities once it has built from it', () => {
    const factory = new XMLInputFactory();
    const reader = factory.createStreamReader('<!DOCTYPE r [<!ENTITY e "<i>x</i>">]><r><a>&e;</a><b>&e;</b></r>');
    while (reader.next() !== EventType.START_ELEMENT);
    reader.nextTag();
    const builder = new XdmDocumentBuilder();
    const first = builder.parse(reader);
    reader.nextTag();
    const second = builder.parse(reader);
    expect([first.stringValue, second.stringValue]).toEqual(['x', 'x']);
  });
});

describe('XdmDocumentBuilder: an asynchronous reader that turns out to stand at an element', () => {
  it('builds the element as a document without the reader’s URI', async () => {
    const chunks = ['<a>', '<b>x</b></a>'].map((text) => new TextEncoder().encode(text));
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const reader = new XMLInputFactory().createAsyncStreamReader({ systemId: 'http://example.com/d.xml', stream });
    let type = reader.next();
    for (let started = 0; started < 1 || type !== EventType.NEED_INPUT; type = reader.next()) {
      if (type === EventType.NEED_INPUT) await reader.fill();
      if (type === EventType.START_ELEMENT) started++;
    }
    const document = await new XdmDocumentBuilder().parseAsync(reader);
    expect([labels(document.children()), document.documentURI, document.baseURI]).toEqual([
      ['element b'],
      null,
      'http://example.com/d.xml',
    ]);
  });
});
