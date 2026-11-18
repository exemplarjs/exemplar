import { outlineHandler, outlineOfEvents } from '@test/helpers/outline';
import { factory, MAIN, XI } from '@test/helpers/xinclude';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '@exemplarjs/canonical';
import { DocumentBuilder } from '@exemplarjs/dom';
import { SAXParser } from '@exemplarjs/sax';
import {
  type AnyReader,
  CARRIERS,
  CUT_SHORT,
  DROPPING,
  eventTagsOf,
  tagsOf,
  UNBALANCING,
} from '@exemplarjs/test-support';
import { StringSink, XMLOutputFactory } from '@exemplarjs/writer';
import { XdmDocumentBuilder, type XdmNode } from '@exemplarjs/xdm';
import { type StreamReader, ErrorCode, XMLInputFactory } from '@exemplarjs/xml';

/** The error a reader gives whose filter leaves a tag without its partner. */
const MISMATCH = expect.objectContaining({ code: ErrorCode.WF_END_TAG_MISMATCH }) as unknown;

const plain = new XMLInputFactory();

/** A cursor over a document that includes `part` from another file, with nothing added to what is included. */
function including(part: string): StreamReader {
  const files = { 'file:///doc/part.xml': part };
  return factory(files, { settings: { fixupBaseURIs: false, fixupLanguage: false } }).createStreamReader({
    text: `<doc ${XI}><xi:include href="part.xml"/></doc>`,
    systemId: MAIN,
  });
}

/** A cursor over the same document with `part` written where it is included. */
function inPlace(part: string): StreamReader {
  return plain.createStreamReader(`<doc ${XI}>${part}</doc>`);
}

/** What SAX reports of a reader, as an outline. */
function saxOutline(reader: AnyReader): string[] {
  const outline: string[] = [];
  new SAXParser(plain).parse(reader, outlineHandler(outline));
  return outline;
}

/** An XDM node and everything below it as lines: its kind, name and value, and an element's attributes. */
function treeOutline(node: XdmNode): string[] {
  const attributes = node.attributes().map((attribute) => `${attribute.nodeName}=${attribute.stringValue}`);
  const line = `${node.kindName} ${node.nodeName} ${JSON.stringify(node.stringValue)} [${attributes.join(' ')}]`;
  return [line, ...node.children().flatMap((child) => treeOutline(child))];
}

/** What `copy` writes of a reader. */
function copied(reader: AnyReader): string {
  const sink = new StringSink();
  const writer = new XMLOutputFactory({ omitXMLDeclaration: true }).createStreamWriter(sink);
  writer.copy(reader);
  writer.flush();
  return sink.toString();
}

/** A consumer of a reader, and what it makes of one. */
type Consumer = readonly [string, (reader: AnyReader) => unknown];

/** The consumers that read whole elements, and refuse a reader whose tags do not pair up. */
const WHOLE_ELEMENT_CONSUMERS: readonly Consumer[] = [
  ['SAX', (reader) => saxOutline(reader)],
  ['the DOM builder', (reader) => canonicalize(new DocumentBuilder(plain).parse(reader), { comments: true })],
  ['canonicalization', (reader) => canonicalize(reader, { comments: true })],
  ['the XDM builder', (reader) => treeOutline(new XdmDocumentBuilder().parse(reader))],
  ['StreamWriter.copy', (reader) => copied(reader)],
];

/** Every consumer of a reader. */
const CONSUMERS: readonly Consumer[] = [
  ['the cursor', (reader) => tagsOf(reader)],
  ['the event reader', (reader) => outlineOfEvents(plain.createEventReader(reader))],
  ...WHOLE_ELEMENT_CONSUMERS,
];

describe.each(CONSUMERS)('%s reading an XInclude reader behind a filter', (_consumer, consume) => {
  describe.each(DROPPING)('that drops %s', (_dropped, filter, xml, reads) => {
    it.each(CARRIERS)('on %s, reads the document without them', (_carrier, carry) => {
      const reader = carry(including(xml), filter());
      expect(consume(reader)).toEqual(consume(inPlace(reads)));
    });
  });
});

describe.each(UNBALANCING)('an XInclude reader behind a filter that drops %s', (_dropped, filter, xml) => {
  it.each(CARRIERS)('on %s, gives events whose end tags are named as the cursor names them', (_carrier, carry) => {
    const events = plain.createEventReader(carry(including(xml), filter()));
    const again = carry(including(xml), filter());
    expect(eventTagsOf(events)).toEqual(tagsOf(again));
  });

  it.each(CARRIERS)('on %s, is refused by the consumers that need whole elements', (_carrier, carry) => {
    for (const [, consume] of WHOLE_ELEMENT_CONSUMERS) {
      expect(() => consume(carry(including(xml), filter()))).toThrow(MISMATCH);
    }
  });
});

describe.each(CONSUMERS)('%s reading an XInclude reader whose included document is cut short', (_consumer, consume) => {
  it.each(CARRIERS)('behind a filter on %s, fails with the error of the included document', (_carrier, carry) => {
    const [, filter] = DROPPING[0] as (typeof DROPPING)[number];
    const cut = expect.objectContaining({
      code: ErrorCode.WF_UNEXPECTED_END,
      systemId: 'file:///doc/part.xml',
    }) as unknown;
    expect(() => consume(carry(including(CUT_SHORT), filter()))).toThrow(cut);
  });
});
