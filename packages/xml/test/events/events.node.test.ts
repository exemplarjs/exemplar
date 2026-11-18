import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createFilteredReader } from '@/filters/index';
import { EventType, type XMLEvent, XMLInputFactory } from '@/index';

setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

/** The size of the comment that fills the document's one chunk. */
const PADDING_LENGTH = 16 * 1024 * 1024;
/** Much less than the chunk, and more than a collection leaves behind. */
const KEPT_LIMIT = PADDING_LENGTH / 4;

/** Collections it takes to free strings held outside the heap. */
const GARBAGE_PASSES = 3;

/** The memory in use, strings held outside the heap included, after collecting garbage. */
function memoryInUse(): number {
  for (let pass = 0; pass < GARBAGE_PASSES; pass++) collectGarbage();
  const { heapUsed, external } = process.memoryUsage();
  return heapUsed + external;
}

/** A START_ELEMENT event. */
type StartElement = Extract<XMLEvent, { type: typeof EventType.START_ELEMENT }>;

/** Reads a document padded to one large chunk as events and keeps only what `pick` takes from its root's start tag. */
function keptFromStartTag(pick: (event: StartElement) => string): string {
  const padding = 'c'.repeat(PADDING_LENGTH);
  const long = 'a-long-prefix-or-name';
  const document = `<${long}:${long} xmlns:${long}="urn:x" ${long}:${long}="${long}"><!--${padding}--></${long}:${long}>`;
  const factory = new XMLInputFactory();
  let kept = '';
  for (const event of factory.createEventReader(new TextEncoder().encode(document))) {
    if (event.type === EventType.START_ELEMENT) kept = pick(event);
  }
  // The engine keeps the text a regular expression last matched in, here the chunk, until another matches.
  expect(/x/.test('x')).toBe(true);
  return kept;
}

describe('event objects and the input they were read from', () => {
  it.each<[string, (event: StartElement) => string]>([
    ['an element’s prefix', (event) => event.name.prefix],
    ['an element’s local name', (event) => event.name.localName],
    ['an attribute’s prefix', (event) => event.attributes[0]?.name.prefix ?? ''],
    ['an attribute’s value', (event) => event.attributes[0]?.value ?? ''],
    ['a declared prefix', (event) => event.namespaces[0]?.prefix ?? ''],
    ['a declared namespace', (event) => event.namespaces[0]?.namespaceURI ?? ''],
  ])('do not keep the input alive through %s', (_what, pick) => {
    const before = memoryInUse();
    const kept = keptFromStartTag(pick);
    expect(kept).not.toBe('');
    expect(memoryInUse() - before).toBeLessThan(KEPT_LIMIT);
  });
});

describe('an event reader behind a filter that drops every end tag', () => {
  it('does not keep what the start tags declared', async () => {
    const factory = new XMLInputFactory();
    const cursor = factory.createStreamReader('<r><e xmlns:p="urn:p"/><e/><e/></r>');
    const starts = createFilteredReader(cursor, (reader) => reader.eventType() === EventType.START_ELEMENT);
    const events = factory.createEventReader(starts);
    /** The namespaces of the next start tag that declares any, held weakly. */
    const declared = (): WeakRef<object> => {
      for (const event of events) {
        if (event.type === EventType.START_ELEMENT && event.namespaces.length > 0) return new WeakRef(event.namespaces);
      }
      throw new Error('No start tag declares a namespace');
    };
    const namespaces = declared();
    // A weak reference holds its target until the job that made it ends.
    await new Promise((resolve) => setImmediate(resolve));
    for (let pass = 0; pass < GARBAGE_PASSES; pass++) collectGarbage();
    expect(namespaces.deref()).toBeUndefined();
    expect(events.next().done).toBe(false);
  });
});
