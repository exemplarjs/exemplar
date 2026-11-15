import { describe, expect, it } from 'vitest';
import * as filters from '@/filters/index';
import { createDelegatedReader, createFilteredReader, StreamReaderDelegate } from '@/filters/index';
import { EventType, type XMLEvent, XMLInputFactory } from '@/index';

const xml = new XMLInputFactory();
const DOCUMENT = '<a><!--c--><?p d?><b>t</b></a>';

/** The event types a reader gives. */
function types(reader: { next(): EventType }): EventType[] {
  const out: EventType[] = [];
  for (let e = reader.next(); e !== EventType.END_DOCUMENT; e = reader.next()) out.push(e);
  return out;
}

describe('@exemplarjs/xml/filters', () => {
  it('exports the filtered readers and the delegate', () => {
    expect(Object.keys(filters).toSorted()).toEqual([
      'StreamReaderDelegate',
      'createDelegatedReader',
      'createFilteredReader',
    ]);
    expect(StreamReaderDelegate).toBeTypeOf('function');
  });
});

describe('filtered readers (StAX StreamFilter)', () => {
  it('pass on only the events the filter accepts', () => {
    const reader = createFilteredReader(
      xml.createStreamReader(DOCUMENT),
      (r) => r.eventType() !== EventType.COMMENT && r.eventType() !== EventType.PROCESSING_INSTRUCTION
    );
    expect(types(reader)).toEqual([
      EventType.START_ELEMENT,
      EventType.START_ELEMENT,
      EventType.CHARACTERS,
      EventType.END_ELEMENT,
      EventType.END_ELEMENT,
    ]);
  });

  it('are the reader they were given, the filter running inside its next()', () => {
    const cursor = xml.createStreamReader(DOCUMENT);
    expect(createFilteredReader(cursor, () => true)).toBe(cursor);
  });

  it('combine filters, which read the cursor directly', () => {
    const names: string[] = [];
    const reader = createFilteredReader(
      createFilteredReader(xml.createStreamReader(DOCUMENT), (r) => r.eventType() === EventType.START_ELEMENT),
      (r) => r.localName() !== 'a'
    );
    for (let e = reader.next(); e !== EventType.END_DOCUMENT; e = reader.next()) names.push(reader.localName());
    expect(names).toEqual(['b']);
  });

  it('take several filters, each seeing only what those before it accepted', () => {
    const seen: EventType[] = [];
    const cursor = xml.createStreamReader(DOCUMENT);
    const reader = createFilteredReader(
      cursor,
      (r) => r.eventType() === EventType.START_ELEMENT,
      (r) => {
        seen.push(r.eventType());
        return r.localName() !== 'a';
      }
    );
    expect([reader, types(reader), seen]).toEqual([
      cursor,
      [EventType.START_ELEMENT],
      [EventType.START_ELEMENT, EventType.START_ELEMENT],
    ]);
    expect(createFilteredReader(cursor)).toBe(cursor);
  });

  it('always pass END_DOCUMENT, without asking the filter', () => {
    const asked: EventType[] = [];
    const reader = createFilteredReader(xml.createStreamReader('<a/>'), (r) => {
      asked.push(r.eventType());
      return false;
    });
    expect(reader.next()).toBe(EventType.END_DOCUMENT);
    expect(asked).toEqual([EventType.START_ELEMENT, EventType.END_ELEMENT]);
  });

  it('leave the accessors describing the event the filter accepted', () => {
    const reader = createFilteredReader(
      xml.createStreamReader('<a x="1"><b y="2"/></a>'),
      (r) => r.localName() === 'b'
    );
    expect([reader.next(), reader.name(), reader.attributeValue(0)]).toEqual([EventType.START_ELEMENT, 'b', '2']);
  });

  it('see the events of a filtered asynchronous reader as they come', async () => {
    const reader = createFilteredReader(xml.createAsyncStreamReader(), (r) => r.eventType() !== EventType.COMMENT);
    reader.feed(new TextEncoder().encode('<a><!--c-->'));
    const seen: EventType[] = [];
    for (let e = reader.next(); e !== EventType.NEED_INPUT; e = reader.next()) seen.push(e);
    reader.feed(new TextEncoder().encode('</a>'));
    reader.endOfInput();
    for (let e = reader.next(); e !== EventType.END_DOCUMENT; e = reader.next()) seen.push(e);
    expect(seen).toEqual([EventType.START_DOCUMENT, EventType.START_ELEMENT, EventType.END_ELEMENT]);
  });
});

describe('filtered event readers (StAX EventFilter)', () => {
  it('filter event readers, always passing END_DOCUMENT', () => {
    const reader = createFilteredReader(xml.createEventReader(DOCUMENT), (e) => e.type === EventType.START_ELEMENT);
    expect([...reader].map((e) => e.type)).toEqual([
      EventType.START_ELEMENT,
      EventType.START_ELEMENT,
      EventType.END_DOCUMENT,
    ]);
  });

  it('take several event filters, in order', () => {
    const reader = createFilteredReader(
      xml.createEventReader(DOCUMENT),
      (e) => e.type === EventType.START_ELEMENT,
      (e) => e.type === EventType.START_ELEMENT && e.name.localName === 'b'
    );
    expect([...reader].map((e) => e.type)).toEqual([EventType.START_ELEMENT, EventType.END_DOCUMENT]);
  });

  it('are the event reader they were given', () => {
    const reader = xml.createEventReader(DOCUMENT);
    expect(createFilteredReader(reader, () => true)).toBe(reader);
  });

  it('filter asynchronous event readers', async () => {
    const reader = createFilteredReader(
      xml.createAsyncEventReader(DOCUMENT),
      (e: XMLEvent) => e.type === EventType.CHARACTERS
    );
    const texts: string[] = [];
    for await (const event of reader) if (event.type === EventType.CHARACTERS) texts.push(event.text);
    expect(texts).toEqual(['t']);
  });
});

describe('delegated readers (createDelegatedReader)', () => {
  /** A delegate that puts a mark after text. */
  class Marked extends StreamReaderDelegate {
    readonly #mark: string;

    constructor(mark: string) {
      super();
      this.#mark = mark;
    }

    override text(): string {
      return `${super.text()}${this.#mark}`;
    }
  }

  it('stack delegates on a reader, each reading through the one before it', () => {
    const cursor = xml.createStreamReader('<a>t</a>');
    const [first, second] = [new Marked('1'), new Marked('2')];
    const reader = createDelegatedReader(cursor, first, second);
    expect([reader, first.parent, second.parent]).toEqual([second, cursor, first]);
    expect([reader.next(), reader.next(), reader.text()]).toEqual([
      EventType.START_ELEMENT,
      EventType.CHARACTERS,
      't12',
    ]);
  });

  it('stack on a delegate too, and a single delegate reads the reader itself', () => {
    const below = new StreamReaderDelegate(xml.createStreamReader('<a>t</a>'));
    const reader = createDelegatedReader(below, new Marked('!'));
    expect([reader.parent, reader.next(), reader.next(), reader.text()]).toEqual([
      below,
      EventType.START_ELEMENT,
      EventType.CHARACTERS,
      't!',
    ]);
  });
});
