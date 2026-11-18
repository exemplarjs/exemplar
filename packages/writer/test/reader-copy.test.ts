import { describe, expect, it } from 'vitest';
import { UpperCaseText } from '@exemplarjs/test-support';
import { EventType, type InputOptions, InvalidArgumentError, XMLInputFactory } from '@exemplarjs/xml';
import { createDelegatedReader, createFilteredReader, StreamReaderDelegate } from '@exemplarjs/xml/filters';
import { type Sink, StringSink, XMLOutputFactory } from '@/index';

const DOCUMENT =
  '<?xml version="1.0" standalone="yes"?><!DOCTYPE r [<!ENTITY e "x">]><!--c--><?p d?>' +
  '<r xmlns="urn:d" xmlns:p="urn:p" p:a="1"><p:e/><![CDATA[c]]>t&e;<e/></r><?end?>';

/** What an event reader and an event writer make of a document. */
function throughEvents(xml: string, input: InputOptions): string {
  const sink = new StringSink();
  const writer = new XMLOutputFactory().createEventWriter(sink);
  writer.add(new XMLInputFactory(input).createEventReader(xml));
  writer.flush();
  return sink.toString();
}

/** What `copy` writes of a document. */
function copied(xml: string, input: InputOptions = {}): string {
  const sink = new StringSink();
  const writer = new XMLOutputFactory().createStreamWriter(sink);
  writer.copy(new XMLInputFactory(input).createStreamReader(xml));
  writer.flush();
  return sink.toString();
}

/** A sink that counts how often it is asked whether it has room. */
function countingSink(): { sink: Sink; text: () => string; waits: () => number } {
  let text = '';
  let waits = 0;
  const sink: Sink = {
    write: (chunk) => {
      text += chunk;
    },
    drain: () => {
      waits++;
      return Promise.resolve();
    },
  };
  return { sink, text: () => text, waits: () => waits };
}

describe('StreamWriter.copy', () => {
  it.each([
    ['with entity references kept', { replaceEntityReferences: false }],
    ['with entity references replaced', {}],
    ['with declarations reported as attributes too', { namespacePrefixes: true }],
  ])('writes a document as an event reader and an event writer would, %s', (_title, input) => {
    expect(copied(DOCUMENT, input)).toBe(throughEvents(DOCUMENT, input));
  });

  it('writes every kind of event', () => {
    expect(copied(DOCUMENT, { replaceEntityReferences: false })).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><!DOCTYPE r [<!ENTITY e "x">]><!--c--><?p d?>' +
        '<r xmlns="urn:d" xmlns:p="urn:p" p:a="1"><p:e/><![CDATA[c]]>t&e;<e/></r><?end?>'
    );
  });

  it('writes what filters and delegates change', () => {
    const source = new XMLInputFactory().createStreamReader('<a><!--c--><b>quiet</b></a>');
    const withoutComments = createFilteredReader(source, (reader) => reader.eventType() !== EventType.COMMENT);
    const sink = new StringSink();
    const writer = new XMLOutputFactory({ omitXMLDeclaration: true }).createStreamWriter(sink);
    writer.copy(createDelegatedReader(withoutComments, new UpperCaseText()));
    writer.flush();
    expect(sink.toString()).toBe('<a><b>QUIET</b></a>');
  });

  it('writes an element read from its start tag inside the document being written, and leaves the reader at its end', () => {
    const reader = new XMLInputFactory().createStreamReader(
      '<a xmlns:q="urn:q" xmlns:s="urn:s"><b><q:c s:d=""/></b><e/></a>'
    );
    reader.nextTag();
    reader.nextTag();
    const sink = new StringSink();
    const writer = new XMLOutputFactory().createStreamWriter(sink);
    writer.writeStartDocument();
    writer.writeStartElement('out');
    // The output has one of the namespaces the element inherits in scope already.
    writer.writeNamespace('s', 'urn:s');
    writer.copy(reader);
    writer.writeEndDocument();
    writer.flush();
    expect(sink.toString()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><out xmlns:s="urn:s"><b xmlns:q="urn:q"><q:c s:d=""/></b></out>'
    );
    expect([reader.eventType(), reader.localName(), reader.nextTag(), reader.localName()]).toEqual([
      EventType.END_ELEMENT,
      'b',
      EventType.START_ELEMENT,
      'e',
    ]);
  });

  it('refuses a reader that has to wait for its input', () => {
    const writer = new XMLOutputFactory().createStreamWriter(new StringSink());
    const reader = new XMLInputFactory().createAsyncStreamReader();
    expect(() => writer.copy(reader)).toThrow(
      new InvalidArgumentError('StreamWriter.copy needs a synchronous reader, or one with its whole input')
    );
  });
});

describe('StreamWriter.copyAsync', () => {
  /** A document's bytes, a few at a time. */
  async function* inPieces(xml: string, size: number): AsyncGenerator<Uint8Array> {
    const bytes = new TextEncoder().encode(xml);
    for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size);
  }

  it('writes a document as its input arrives, waiting for the destination before each wait for input', async () => {
    const { sink, text, waits } = countingSink();
    const writer = new XMLOutputFactory().createStreamWriter(sink);
    const reader = new XMLInputFactory({ replaceEntityReferences: false }).createAsyncStreamReader(
      inPieces(DOCUMENT, 16)
    );
    await writer.copyAsync(reader);
    await writer.close();
    expect(text()).toBe(copied(DOCUMENT, { replaceEntityReferences: false }));
    expect(waits()).toBeGreaterThan(DOCUMENT.length / 16 / 2);
  });

  it('writes an element read from its start tag, through a delegate', async () => {
    const reader = new StreamReaderDelegate(
      new XMLInputFactory().createAsyncStreamReader(inPieces('<a><b>x</b></a>', 4))
    );
    while (reader.next() !== EventType.START_ELEMENT || reader.localName() !== 'b') {
      if (reader.eventType() === EventType.NEED_INPUT) await reader.fill();
    }
    const sink = new StringSink();
    const writer = new XMLOutputFactory().createStreamWriter(sink);
    await writer.copyAsync(reader);
    writer.flush();
    expect(sink.toString()).toBe('<b>x</b>');
  });
});
