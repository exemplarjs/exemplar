import { describe, expect, it } from 'vitest';
import { UpperCaseText } from '@exemplarjs/test-support';
import { RESIDENT_READERS } from '@/config/factory';
import type { XIncludeProcessor } from '@/config/options';
import { AsyncEventReader, EventReader, EventType, type XMLEvent, XMLInputFactory } from '@/index';
import { CREATE_READER, StreamReader } from '@/internal';

const encoder = new TextEncoder();

/** Reads an asynchronous cursor to its end, awaiting input; returns the event types. */
async function typesAsync(reader: StreamReader): Promise<EventType[]> {
  const out: EventType[] = [];
  for (let e = reader.next(); e !== EventType.END_DOCUMENT; e = reader.next()) {
    if (e === EventType.NEED_INPUT) await reader.fill();
    else out.push(e);
  }
  return out;
}

/** The types of a list of event objects. */
const typesOf = (events: readonly XMLEvent[]): EventType[] => events.map((e) => e.type);

describe('XMLInputFactory (JAXP XMLInputFactory)', () => {
  it('resolves its options once, with every default filled in', () => {
    const factory = new XMLInputFactory({ coalescing: true });
    expect(factory.options).toMatchObject({ coalescing: true, namespaceAware: true, limits: { elementDepth: 100 } });
    expect(new XMLInputFactory().options.coalescing).toBe(false);
  });

  it('withOptions makes a factory with the same options but for the ones given, leaving the first unchanged', () => {
    const first = new XMLInputFactory({ coalescing: true, namespaceAware: false });
    const second = first.withOptions({ namespaceAware: true });
    expect([second.options.coalescing, second.options.namespaceAware]).toEqual([true, true]);
    expect(first.options.namespaceAware).toBe(false);
  });

  it('createStreamReader gives a cursor at START_DOCUMENT', () => {
    const reader = new XMLInputFactory().createStreamReader('<a/>');
    expect(reader).toBeInstanceOf(StreamReader);
    expect(reader.eventType()).toBe(EventType.START_DOCUMENT);
  });

  it('createAsyncStreamReader over a source starts at NEED_INPUT and reads the source', async () => {
    const reader = new XMLInputFactory().createAsyncStreamReader(encoder.encode('<a/>'));
    expect(reader.eventType()).toBe(EventType.NEED_INPUT);
    expect(await typesAsync(reader)).toEqual([
      EventType.START_DOCUMENT,
      EventType.START_ELEMENT,
      EventType.END_ELEMENT,
    ]);
  });

  it('createAsyncStreamReader without a source gives a reader to feed', async () => {
    const reader = new XMLInputFactory().createAsyncStreamReader();
    reader.feed(encoder.encode('<a/>'));
    reader.endOfInput();
    expect(await typesAsync(reader)).toEqual([
      EventType.START_DOCUMENT,
      EventType.START_ELEMENT,
      EventType.END_ELEMENT,
    ]);
  });

  it('createEventReader reads a source, or a cursor it is given', () => {
    const factory = new XMLInputFactory();
    const fromSource = factory.createEventReader('<a/>');
    expect(fromSource).toBeInstanceOf(EventReader);
    expect(typesOf([...fromSource])).toEqual([
      EventType.START_DOCUMENT,
      EventType.START_ELEMENT,
      EventType.END_ELEMENT,
      EventType.END_DOCUMENT,
    ]);
    const cursor = factory.createStreamReader('<b/>');
    const events = [...factory.createEventReader(cursor)];
    expect(events[1]?.type === EventType.START_ELEMENT && events[1].name.localName).toBe('b');
    expect(cursor.eventType()).toBe(EventType.END_DOCUMENT);
  });

  it('createEventReader reads a delegate it is given, through the delegate', () => {
    const factory = new XMLInputFactory();
    const events = [...factory.createEventReader(new UpperCaseText(factory.createStreamReader('<a>x</a>')))];
    expect(events[2]?.type === EventType.CHARACTERS && events[2].text).toBe('X');
  });

  it('createAsyncEventReader reads a source or an asynchronous cursor', async () => {
    const factory = new XMLInputFactory();
    /** The types of the events an async event reader yields. */
    const collect = async (reader: AsyncEventReader) => {
      const out: XMLEvent[] = [];
      for await (const event of reader) out.push(event);
      return typesOf(out);
    };
    const expected = [EventType.START_DOCUMENT, EventType.START_ELEMENT, EventType.END_ELEMENT, EventType.END_DOCUMENT];
    expect(await collect(factory.createAsyncEventReader('<a/>'))).toEqual(expected);
    const cursor = factory.createAsyncStreamReader('<a/>');
    expect(await collect(factory.createAsyncEventReader(cursor))).toEqual(expected);
    expect(factory.createAsyncEventReader()).toBeInstanceOf(AsyncEventReader);
    const fed = factory.createAsyncStreamReader();
    const viaCursor = collect(factory.createAsyncEventReader(fed));
    fed.feed(encoder.encode('<a/>'));
    fed.endOfInput();
    expect(await viaCursor).toEqual(expected);
  });

  it('createEventStream gives a web stream of the events', async () => {
    const factory = new XMLInputFactory();
    const types: EventType[] = [];
    for await (const event of factory.createEventStream('<a>t</a>')) types.push(event.type);
    expect(types).toEqual([
      EventType.START_DOCUMENT,
      EventType.START_ELEMENT,
      EventType.CHARACTERS,
      EventType.END_ELEMENT,
      EventType.END_DOCUMENT,
    ]);
    const fromCursor = factory.createEventStream(factory.createStreamReader('<a/>'));
    expect(fromCursor).toBeInstanceOf(ReadableStream);
  });

  it('uses the decoders it is given for the encodings they name', () => {
    const accents = { decode: (bytes?: Uint8Array) => new TextDecoder().decode(bytes).replaceAll('#', 'é') };
    const factory = new XMLInputFactory({ decoders: { 'x-accents': () => accents } });
    const reader = factory.createStreamReader(encoder.encode('<?xml version="1.0" encoding="x-accents"?><a>#</a>'));
    reader.next();
    expect([reader.next(), reader.text()]).toEqual([EventType.CHARACTERS, 'é']);
  });
});

describe('XMLInputFactory internals', () => {
  it('CREATE_READER makes a cursor with some resolved options replaced', () => {
    const factory = new XMLInputFactory();
    const reader = factory[CREATE_READER]('<a>x<![CDATA[y]]></a>', { coalescing: true }, false);
    reader.next();
    expect([reader.next(), reader.text()]).toEqual([EventType.CHARACTERS, 'xy']);
  });

  it('CREATE_READER applies the same overrides again to each cursor, and others apart', () => {
    const factory = new XMLInputFactory();
    const overrides = { coalescing: true };
    const texts = [overrides, overrides, { coalescing: false }].map((given) => {
      const reader = factory[CREATE_READER]('<a>x<![CDATA[y]]></a>', given, false);
      reader.next();
      reader.next();
      return reader.text();
    });
    expect(texts).toEqual(['xy', 'xy', 'x']);
  });

  it('CREATE_READER reports to a per-call error handler over the cached overrides', () => {
    const factory = new XMLInputFactory();
    const overrides = { checkNormalization: true };
    const warnings: string[] = [];
    const errorHandler = { warning: (e: { code: string }) => warnings.push(e.code) };
    const reader = factory[CREATE_READER]('<?xml version="1.1"?><a>e\u0301</a>', overrides, false, errorHandler);
    while (reader.next() !== EventType.END_DOCUMENT);
    expect(warnings).toEqual(['NOT_FULLY_NORMALIZED']);
  });

  it('CREATE_READER makes an asynchronous cursor when asked', async () => {
    const reader = new XMLInputFactory()[CREATE_READER]('<a/>', {}, true);
    expect(reader.eventType()).toBe(EventType.NEED_INPUT);
    expect(await typesAsync(reader)).toEqual([
      EventType.START_DOCUMENT,
      EventType.START_ELEMENT,
      EventType.END_ELEMENT,
    ]);
  });

  it('hands every reader to the XInclude processor when one is set', () => {
    const calls: unknown[][] = [];
    const xinclude: XIncludeProcessor = {
      createReader(source, opened, options, registry, input) {
        calls.push([source, options.coalescing, input === undefined]);
        return new StreamReader(opened, options, registry, input);
      },
    };
    const factory = new XMLInputFactory({ xinclude, coalescing: true });
    factory.createStreamReader('<a/>');
    factory.createAsyncStreamReader('<b/>');
    expect(calls).toEqual([
      ['<a/>', true, true],
      ['<b/>', true, false],
    ]);
  });

  it('keeps one reader alive for each kind of source', () => {
    expect(RESIDENT_READERS).toHaveLength(2);
    for (const reader of RESIDENT_READERS) expect(reader).toBeInstanceOf(StreamReader);
  });
});
