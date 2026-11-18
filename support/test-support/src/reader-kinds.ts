import { EventType, type StreamReader, type XMLEvent } from '@exemplarjs/xml';
import { createFilteredReader, type StreamFilter, StreamReaderDelegate } from '@exemplarjs/xml/filters';

const { START_ELEMENT, END_ELEMENT, COMMENT, PROCESSING_INSTRUCTION } = EventType;

/** A reader as a consumer is given one: a cursor, or a delegate over one. */
export type AnyReader = StreamReader | StreamReaderDelegate;

/** A filter that drops the events of some kinds. */
function withoutKinds(...kinds: EventType[]): StreamFilter {
  return (reader) => !kinds.includes(reader.eventType());
}

/** A filter that drops the tags of one kind of the elements with one name, and keeps what is between them. */
function withoutTags(name: string, ...kinds: EventType[]): StreamFilter {
  return (reader) => !(kinds.includes(reader.eventType()) && reader.localName() === name);
}

/** A filter that drops the elements with one name, and everything in them. */
function withoutElements(name: string): StreamFilter {
  let depth = 0;
  return (reader) => {
    const type = reader.eventType();
    if (depth === 0 && !(type === START_ELEMENT && reader.localName() === name)) return true;
    if (type === START_ELEMENT) depth++;
    if (type === END_ELEMENT) depth--;
    return false;
  };
}

/** Filters that leave a well-formed document: what each drops, the filter, a document, and what it then reads as. */
export const DROPPING: readonly (readonly [string, () => StreamFilter, string, string])[] = [
  [
    'comments and processing instructions',
    () => withoutKinds(COMMENT, PROCESSING_INSTRUCTION),
    '<r xmlns:p="urn:p"><!--c--><a p:x="1"/><?p d?><p:b>t</p:b></r>',
    '<r xmlns:p="urn:p"><a p:x="1"/><p:b>t</p:b></r>',
  ],
  [
    'an element and everything in it',
    () => withoutElements('skip'),
    '<r xmlns:p="urn:p"><a/><skip p:x="1"><p:b>t</p:b><skip/></skip><p:c y="2">u</p:c></r>',
    '<r xmlns:p="urn:p"><a/><p:c y="2">u</p:c></r>',
  ],
  [
    'the tags around an element’s content',
    () => withoutTags('wrap', START_ELEMENT, END_ELEMENT),
    '<r xmlns:p="urn:p"><wrap><p:a>t</p:a><wrap><b/></wrap></wrap><c/></r>',
    '<r xmlns:p="urn:p"><p:a>t</p:a><b/><c/></r>',
  ],
];

/** Filters that leave tags without their partners: what each drops, the filter, and a document. */
export const UNBALANCING: readonly (readonly [string, () => StreamFilter, string])[] = [
  [
    'a start tag',
    () => withoutTags('b', START_ELEMENT),
    '<r xmlns:p="urn:p"><a><p:b xmlns:q="urn:q">t</p:b></a><c/></r>',
  ],
  ['an end tag', () => withoutTags('b', END_ELEMENT), '<r xmlns:p="urn:p"><a><p:b xmlns:q="urn:q">t</p:b></a><c/></r>'],
];

/** A document that ends inside a start tag, after content a consumer has already been given. */
export const CUT_SHORT = '<r><!--c--><a>t</a><b';

/** Where a filter sits: what holds it, and the filtered reader made from a cursor. */
export const CARRIERS: readonly (readonly [string, (cursor: StreamReader, filter: StreamFilter) => AnyReader])[] = [
  ['the cursor', (cursor, filter) => createFilteredReader(cursor, filter)],
  ['a delegate over the cursor', (cursor, filter) => createFilteredReader(new StreamReaderDelegate(cursor), filter)],
  ['the cursor under a delegate', (cursor, filter) => new StreamReaderDelegate(createFilteredReader(cursor, filter))],
];

/** The tags a reader reports, each end tag with the prefixes that go out of scope at it. */
export function tagsOf(reader: AnyReader): string[] {
  const tags: string[] = [];
  for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
    const prefixes = Array.from({ length: reader.namespaceCount() }, (_, i) => reader.namespacePrefix(i));
    if (type === START_ELEMENT) tags.push(`<${reader.name()}>`);
    if (type === END_ELEMENT) tags.push(`</${reader.name()} ${prefixes.join(',')}>`);
  }
  return tags;
}

/** The same tags, as the events of an event reader name them. */
export function eventTagsOf(events: Iterable<XMLEvent>): string[] {
  const tags: string[] = [];
  for (const event of events) {
    if (event.type === START_ELEMENT) tags.push(`<${event.name.toString()}>`);
    if (event.type === END_ELEMENT) {
      tags.push(`</${event.name.toString()} ${event.namespaces.map((namespace) => namespace.prefix).join(',')}>`);
    }
  }
  return tags;
}
