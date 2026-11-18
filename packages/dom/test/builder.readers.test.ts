import { serialize } from '@test/helpers/dom';
import { describe, expect, it } from 'vitest';
import { streamOf, utf8, UpperCaseText } from '@exemplarjs/test-support';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader } from '@exemplarjs/xml/filters';
import { type Attr, DocumentBuilder, type Element } from '@/index';

describe('DocumentBuilder: building from a reader', () => {
  it('builds a whole document from a reader at its start, through its filters and delegates, with its URI', () => {
    const factory = new XMLInputFactory();
    const reader = createFilteredReader(
      new UpperCaseText(
        factory.createStreamReader({ systemId: 'http://example.com/d.xml', text: '<a xmlns:p="urn:p">x<!--c--></a>' })
      ),
      (r) => r.eventType() !== EventType.COMMENT
    );
    const document = new DocumentBuilder().parse(reader);
    expect(serialize(document)).toBe('<a xmlns:p="urn:p">X</a>');
    expect(document.documentURI).toBe('http://example.com/d.xml');
  });

  it('adds xmlns attributes for the declarations a reader does not report as attributes', () => {
    const reader = new XMLInputFactory().createStreamReader('<a xmlns="urn:d" xmlns:p="urn:p" p:x="1"/>');
    const root = new DocumentBuilder().parse(reader).documentElement as Element;
    const attributes = [...root.attributes] as Attr[];
    expect(attributes.map((attr) => `${attr.name}=${attr.value} ${attr.namespaceURI}`)).toEqual([
      'xmlns=urn:d http://www.w3.org/2000/xmlns/',
      'xmlns:p=urn:p http://www.w3.org/2000/xmlns/',
      'p:x=1 urn:p',
    ]);
    expect((root.attributes[0] as Attr).ownerElement).toBe(root);
  });

  it('builds an element from a reader at its start tag, declaring the namespaces it inherits, leaving the reader at its end', () => {
    for (const namespacePrefixes of [false, true]) {
      const reader = new XMLInputFactory({ namespacePrefixes }).createStreamReader(
        '<feed xmlns="urn:f" xmlns:p="urn:p"><entry xmlns:q="urn:q">one</entry><p:entry/></feed>'
      );
      reader.nextTag();
      const builder = new DocumentBuilder();
      const entries: string[] = [];
      while (reader.nextTag() === EventType.START_ELEMENT) {
        const document = builder.parse(reader);
        expect(document.documentURI).toBeNull();
        entries.push(serialize(document));
        expect(reader.eventType()).toBe(EventType.END_ELEMENT);
      }
      expect(entries).toEqual([
        '<entry xmlns:q="urn:q" xmlns="urn:f" xmlns:p="urn:p">one</entry>',
        '<p:entry xmlns="urn:f" xmlns:p="urn:p"/>',
      ]);
    }
  });

  it('builds from an asynchronous reader, awaiting input as it arrives', async () => {
    const reader = new XMLInputFactory().createAsyncStreamReader(streamOf(utf8('<a><b>x</b><b>y</b></a>'), 3));
    const document = await new DocumentBuilder().parseAsync(new UpperCaseText(reader));
    expect(serialize(document)).toBe('<a><b>X</b><b>Y</b></a>');
  });

  it('takes namespaces and entity references from the reader’s options', () => {
    const plain = new XMLInputFactory({ namespaceAware: false }).createStreamReader('<p:a xmlns:p="urn:p"/>');
    const root = new DocumentBuilder().parse(plain).documentElement as Element;
    expect([root.localName, root.namespaceURI, root.attributes.length]).toEqual([null, null, 1]);
    const unexpanded = new XMLInputFactory({ replaceEntityReferences: false }).createStreamReader(
      '<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>'
    );
    const element = new DocumentBuilder().parse(unexpanded).documentElement as Element;
    expect(element.firstChild?.nodeName).toBe('e');
  });
});

describe('DocumentBuilder: an asynchronous reader that turns out to stand at an element', () => {
  it('builds the element as a document without the reader’s URI', async () => {
    const chunks = ['<a>', '<b>x</b></a>'].map((text) => utf8(text));
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
    const document = await new DocumentBuilder().parseAsync(reader);
    expect([serialize(document), document.documentURI]).toEqual(['<b>x</b>', null]);
  });
});
