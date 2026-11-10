import { describe, expect, it } from 'vitest';
import { LISTEN_ENTITIES } from '@/cursor/internal';
import { ReaderInput } from '@/cursor/reader-input';
import type { StreamReader as Cursor } from '@/cursor/stream-reader';
import { createFilteredReader, type StreamFilter, StreamReaderDelegate } from '@/filters/index';
import { InvalidArgumentError } from '@/index';
import { EventType, type InputOptions, type StreamReader, XMLInputFactory } from '@/index';

const SYNC = { consumer: 'test', mode: 'sync' } as const;
const ASYNC = { consumer: 'test', mode: 'async' } as const;

/** A cursor over a document. */
function cursorOver(xml: string, options: InputOptions = {}): StreamReader {
  return new XMLInputFactory(options).createStreamReader(xml);
}

/** The events a consumer reads from a reader, each with the element's name or the text. */
function read(reader: StreamReader | StreamReaderDelegate): string[] {
  const input = new ReaderInput(reader as unknown as Cursor, SYNC);
  const out: string[] = [];
  for (let type = input.first(); ; type = input.next()) {
    if (type === EventType.START_ELEMENT || type === EventType.END_ELEMENT) out.push(`${type} ${reader.name()}`);
    else if (type === EventType.CHARACTERS) out.push(`${type} ${reader.text()}`);
    else out.push(String(type));
    if (type === EventType.END_DOCUMENT) return out;
  }
}

/** The error reading a reader throws. */
function failure(reader: StreamReader | StreamReaderDelegate): unknown {
  try {
    read(reader);
  } catch (error) {
    return error;
  }
  return undefined;
}

/** A filter that drops the start tags of elements of a name. */
function dropStartTags(name: string): StreamFilter {
  return (reader) => !(reader.eventType() === EventType.START_ELEMENT && reader.localName() === name);
}

describe('ReaderInput', () => {
  it('reads the whole document from its start, passing over whitespace outside the root and entity boundaries', () => {
    const reader = cursorOver('<!DOCTYPE a [<!ENTITY e "x">]>\n<a>&e;</a>\n<!--c-->', {
      reportPrologWhitespace: true,
      reportEntityBoundaries: true,
    });
    expect(read(reader)).toEqual(['7', '11', '1 a', '4 x', '2 a', '5', '8']);
  });

  it('reads one element from its start tag, as a document, leaving the reader at its end tag', () => {
    const reader = cursorOver('<list><item>one</item><item>two</item></list>');
    reader.nextTag();
    reader.nextTag();
    expect(read(reader)).toEqual(['7', '1 item', '4 one', '2 item', '8']);
    expect([reader.eventType(), reader.name()]).toEqual([EventType.END_ELEMENT, 'item']);
    reader.nextTag();
    expect(read(reader)).toEqual(['7', '1 item', '4 two', '2 item', '8']);
  });

  it('gives an element the namespaces its ancestors bind, but for xml, undeclarations and its own', () => {
    const reader = cursorOver(
      '<?xml version="1.1"?><a xmlns="urn:d" xmlns:p="urn:p" xmlns:q="urn:q" xmlns:xml="http://www.w3.org/XML/1998/namespace">' +
        '<m xmlns:q=""><b xmlns:p="urn:own" xmlns:r="urn:r"/></m></a>'
    );
    reader.nextTag();
    reader.nextTag();
    reader.nextTag();
    const input = new ReaderInput(reader as unknown as Cursor, SYNC);
    input.first();
    expect(input.isElement).toBe(true);
    expect([...input.inherited]).toEqual([['', 'urn:d']]);
    expect([input.next(), input.depth]).toEqual([EventType.START_ELEMENT, 1]);
  });

  it('gives a whole document, and an element read with namespaces off, no namespaces to declare', () => {
    const whole = new ReaderInput(cursorOver('<a xmlns:p="urn:p"/>') as unknown as Cursor, SYNC);
    whole.first();
    expect([whole.isElement, whole.inherited.size]).toEqual([false, 0]);
    const reader = cursorOver('<a xmlns:p="urn:p"><b/></a>', { namespaceAware: false });
    reader.nextTag();
    reader.nextTag();
    const element = new ReaderInput(reader as unknown as Cursor, SYNC);
    element.first();
    expect(element.inherited.size).toBe(0);
  });

  it('settles where an asynchronous reader starts once it has input, from the document or an element', async () => {
    const factory = new XMLInputFactory();
    const fed = factory.createAsyncStreamReader();
    const input = new ReaderInput(fed as unknown as Cursor, ASYNC);
    expect(input.first()).toBe(EventType.NEED_INPUT);
    expect(input.next()).toBe(EventType.NEED_INPUT);
    fed.feed(new TextEncoder().encode('<a/>'));
    fed.endOfInput();
    expect([input.next(), input.next(), input.next(), input.next()]).toEqual([
      EventType.START_DOCUMENT,
      EventType.START_ELEMENT,
      EventType.END_ELEMENT,
      EventType.END_DOCUMENT,
    ]);
    const streamed = factory.createAsyncStreamReader(new TextEncoder().encode('<a><b/></a>'));
    while ((await streamed.nextTagAsync()) !== EventType.START_ELEMENT || streamed.localName() !== 'b');
    const element = new ReaderInput(streamed as unknown as Cursor, ASYNC);
    expect([element.first(), element.next(), element.next(), element.next()]).toEqual([
      EventType.START_DOCUMENT,
      EventType.START_ELEMENT,
      EventType.END_ELEMENT,
      EventType.END_DOCUMENT,
    ]);
  });

  it('settles on a fed reader whose start is an element', () => {
    const fed = new XMLInputFactory().createAsyncStreamReader();
    fed.feed(new TextEncoder().encode('<a><b/></a>'));
    fed.endOfInput();
    fed.next();
    fed.next();
    const reader = createFilteredReader(new StreamReaderDelegate(fed), () => true);
    expect(read(reader)).toEqual(['7', '1 a', '1 b', '2 b', '2 a', '8']);
  });

  it('refuses a reader that stands anywhere but the start of a document or an element', () => {
    const reader = cursorOver('<a>text</a>');
    reader.next();
    reader.next();
    expect(failure(reader)).toMatchObject({
      name: 'IllegalStateError',
      message: 'test reads a reader from the start of a document or of an element, not from CHARACTERS',
    });
  });

  it('refuses an asynchronous reader that needs input when it is read synchronously', () => {
    const reader = new StreamReaderDelegate(new XMLInputFactory().createAsyncStreamReader());
    expect(failure(reader)).toMatchObject({
      name: 'InvalidArgumentError',
      message: expect.stringContaining('synchronous reader'),
    });
    const fed = new XMLInputFactory().createAsyncStreamReader();
    fed.feed(new TextEncoder().encode('<a>'));
    const started = new StreamReaderDelegate(fed);
    started.next();
    started.next();
    expect(failure(started)).toMatchObject({
      name: 'InvalidArgumentError',
      message: expect.stringContaining('synchronous reader'),
    });
  });

  it.each([
    ['a second root', '<a><b/><c/></a>', 'a', 'WF_SECOND_ROOT', 'A second root element'],
    ['an end tag with no start tag', '<a/>', 'a', 'WF_END_TAG_MISMATCH', 'An end tag a with no start tag'],
    [
      'an end tag for another element',
      '<a><b><c/></b></a>',
      'b',
      'WF_END_TAG_MISMATCH',
      'An end tag b where element a is open',
    ],
    ['text outside the root', '<a>t<b/></a>', 'a', 'WF_CONTENT_OUTSIDE_ROOT', 'Text outside the root element'],
    ['no root', '<a/>', 'a', 'WF_EMPTY_DOCUMENT', 'No root element'],
  ])('fails on %s', (_case, xml, dropped, code, message) => {
    const filter: StreamFilter =
      _case === 'no root'
        ? (r) => r.eventType() !== EventType.START_ELEMENT && r.eventType() !== EventType.END_ELEMENT
        : dropStartTags(dropped);
    const reader = createFilteredReader(cursorOver(xml), filter);
    expect(failure(reader)).toMatchObject({ code, description: message });
  });

  it('fails on elements still open at the end', () => {
    const reader = createFilteredReader(cursorOver('<a><b/></a>'), (r) => r.eventType() !== EventType.END_ELEMENT);
    expect(failure(reader)).toMatchObject({
      code: 'WF_UNCLOSED_ELEMENT',
      description: 'Elements still open at the end',
    });
  });

  it('passes an element and attribute names that a delegate renames consistently', () => {
    class Renaming extends StreamReaderDelegate {
      override name(): string {
        return super.name().replace('a', 'z');
      }

      override localName(): string {
        return super.localName().replace('a', 'z');
      }

      override attributeName(index: number): string {
        return super.attributeName(index).replace('x', 'y');
      }

      override attributeLocalName(index: number): string {
        return super.attributeLocalName(index).replace('x', 'y');
      }
    }

    const reader = new Renaming(cursorOver('<p:a xmlns:p="urn:p" p:x="1"/>'));
    expect(read(reader)).toEqual(['7', '1 p:z', '2 p:z', '8']);
  });

  it.each<[string, Record<string, () => string>, string]>([
    ['a local name that is no NCName', { localName: () => '1a', name: () => '1a' }, 'NS_QNAME'],
    ['a prefix that is no NCName', { prefix: () => '1p', name: () => '1p:a' }, 'NS_QNAME'],
    ['a name that disagrees with its local name', { localName: () => 'b' }, 'NS_QNAME'],
    ['a prefix with no namespace', { prefix: () => 'p', name: () => 'p:a' }, 'NS_UNBOUND_PREFIX'],
    [
      'an attribute with no namespace for its prefix',
      { attributePrefix: () => 'p', attributeName: () => 'p:x' },
      'NS_UNBOUND_PREFIX',
    ],
  ])('fails on %s from a delegate', (_case, overrides, code) => {
    const delegate = Object.assign(new StreamReaderDelegate(cursorOver('<a x="1"/>')), overrides);
    expect(failure(delegate)).toMatchObject({ code, message: expect.stringContaining('An ') });
  });

  it('checks a delegate’s names as plain names with namespaces off', () => {
    const reader = cursorOver('<a:b x:y="1"/>', { namespaceAware: false });
    expect(read(new StreamReaderDelegate(reader))).toEqual(['7', '1 a:b', '2 a:b', '8']);
    const renamed = Object.assign(new StreamReaderDelegate(cursorOver('<a/>', { namespaceAware: false })), {
      name: () => '1a',
    });
    expect(failure(renamed)).toMatchObject({
      code: 'WF_NAME',
      description: 'An element named 1a, which is not a name',
    });
  });

  it('leaves the names of a cursor unchecked, as only a delegate can change them', () => {
    const reader = createFilteredReader(cursorOver('<a/>'), () => true);
    expect(read(reader)).toEqual(['7', '1 a', '2 a', '8']);
  });
});

describe('ReaderInput: the options a consumer needs', () => {
  it('passes a reader with the options asked for, and names the first it lacks', () => {
    const reader = cursorOver('<a/>', { coalescing: true }) as unknown as Cursor;
    const needs = { consumer: 'Builder', mode: 'sync', needs: { coalescing: true, namespaceAware: true } } as const;
    expect(() => new ReaderInput(reader, needs)).not.toThrow();
    expect(() => new ReaderInput(reader, { ...SYNC, consumer: 'Builder', needs: { coalescing: false } })).toThrow(
      new InvalidArgumentError('Builder needs a reader with coalescing: false')
    );
  });
});

describe('ReaderInput.read', () => {
  /** A consumer that records each event and the bindings it is given; it ends at END_DOCUMENT. */
  function recording(): {
    consumer: { add(type: EventType): boolean; inherit(b: ReadonlyMap<string, string>): void };
    seen: string[];
  } {
    const seen: string[] = [];
    return {
      seen,
      consumer: {
        add: (type) => {
          seen.push(String(type));
          return type === EventType.END_DOCUMENT;
        },
        inherit: (bindings) => void seen.push(`inherit ${[...bindings.keys()].join(',')}`),
      },
    };
  }

  it('gives a consumer every event, and an element read on its own the bindings it inherits', () => {
    const reader = cursorOver('<a xmlns:p="urn:p"><b/></a>');
    reader.nextTag();
    reader.nextTag();
    const { consumer, seen } = recording();
    new ReaderInput(reader as unknown as Cursor, SYNC).read(consumer);
    expect(seen).toEqual(['7', '1', 'inherit p', '2', '8']);
  });

  it('waits for input as it is needed', async () => {
    const reader = new XMLInputFactory().createAsyncStreamReader(new TextEncoder().encode('<a/>'));
    const { consumer, seen } = recording();
    await new ReaderInput(reader as unknown as Cursor, ASYNC).readAsync(consumer);
    expect(seen).toEqual(['7', '1', 'inherit ', '2', '8']);
  });

  it('waits for a consumer to drain before each wait for input', async () => {
    async function* pieces(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('<a>');
      yield new TextEncoder().encode('</a>');
    }
    const reader = new XMLInputFactory().createAsyncStreamReader(pieces());
    const { consumer, seen } = recording();
    const drain = (): Promise<void> => {
      seen.push('drain');
      return Promise.resolve();
    };
    await new ReaderInput(reader as unknown as Cursor, ASYNC).readAsync({ ...consumer, drain });
    expect(seen.filter((entry) => entry === 'drain').length).toBeGreaterThan(1);
    expect(seen.filter((entry) => entry !== 'drain')).toEqual(['7', '1', 'inherit ', '2', '8']);
  });

  it('stops the reader telling of entities once read, even when reading fails', () => {
    const reader = cursorOver('<!DOCTYPE a [<!ENTITY e "x">]><a><b>&e;</b>&e;</a>') as unknown as Cursor;
    const heard: string[] = [];
    reader[LISTEN_ENTITIES]({ startEntity: (name) => heard.push(name), endEntity: () => undefined });
    const failing = {
      add: (): boolean => {
        throw new Error('stop');
      },
      inherit: () => undefined,
    };
    expect(() => new ReaderInput(reader, SYNC).read(failing)).toThrow('stop');
    while (reader.next() !== EventType.END_DOCUMENT);
    expect(heard).toEqual([]);
  });
});
