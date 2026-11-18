import { ErrorFactory, IllegalStateError } from '@/util/errors';
import { EventType, isCharacterData } from './event-type.ts';

// Module-level constants, so V8 can inline them; imported bindings are read again on every use.
const {
  START_ELEMENT,
  END_ELEMENT,
  PROCESSING_INSTRUCTION,
  CHARACTERS,
  COMMENT,
  SPACE,
  START_DOCUMENT,
  END_DOCUMENT,
  CDATA,
  NEED_INPUT,
} = EventType;

/** The part of a reader the navigation helpers use. */
interface Navigable {
  next(): EventType;

  eventType(): EventType;

  fill(): Promise<void>;

  text(): string;

  isWhitespace(): boolean;
}

/** Skips whitespace, comments and PIs to the next start or end tag. */
export function nextTag(reader: Navigable): EventType {
  for (;;) {
    const event = reader.next();
    if (event === START_ELEMENT || event === END_ELEMENT) return event;
    passOver(reader, event, 'nextTag');
  }
}

/** Like `nextTag()`, awaiting input when an asynchronous reader needs it. */
export async function nextTagAsync(reader: Navigable): Promise<EventType> {
  for (;;) {
    const event = reader.next();
    if (event === START_ELEMENT || event === END_ELEMENT) return event;
    // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
    if (event === NEED_INPUT) await reader.fill();
    else passOver(reader, event, 'nextTag');
  }
}

/** Checks that `nextTag()` may skip an event: whitespace, in a CDATA section too, a comment, a PI, or an async reader's START_DOCUMENT. */
function passOver(reader: Navigable, event: EventType, method: string): void {
  if (event === NEED_INPUT) throw cannotWait(method);
  const skippable =
    event === START_DOCUMENT ||
    event === COMMENT ||
    event === PROCESSING_INSTRUCTION ||
    event === SPACE ||
    ((event === CHARACTERS || event === CDATA) && reader.isWhitespace());
  if (!skippable) throw ErrorFactory.create(IllegalStateError, 'Expected a start or end tag');
}

/** Reads a text-only element's text and stops at its end tag. */
export function elementText(reader: Navigable): string {
  if (reader.eventType() !== START_ELEMENT)
    throw ErrorFactory.create(IllegalStateError, 'elementText() needs a START_ELEMENT');
  let text = '';
  for (;;) {
    const event = reader.next();
    if (event === END_ELEMENT) return text;
    if (event === NEED_INPUT) throw cannotWait('elementText');
    text += elementTextPart(reader, event, 'elementText');
  }
}

/** Like `elementText()`, awaiting input when an asynchronous reader needs it. */
export async function elementTextAsync(reader: Navigable): Promise<string> {
  if (reader.eventType() !== START_ELEMENT)
    throw ErrorFactory.create(IllegalStateError, 'elementTextAsync() needs a START_ELEMENT');
  let text = '';
  for (;;) {
    const event = reader.next();
    if (event === END_ELEMENT) return text;
    // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
    if (event === NEED_INPUT) await reader.fill();
    else text += elementTextPart(reader, event, 'elementTextAsync');
  }
}

/** Skips the element whose start tag the reader is at, stopping at its end tag. */
export function skipElement(reader: Navigable): void {
  if (reader.eventType() !== START_ELEMENT)
    throw ErrorFactory.create(IllegalStateError, 'skipElement() needs a START_ELEMENT');
  for (let depth = 1; depth > 0;) {
    const event = reader.next();
    if (event === NEED_INPUT) throw cannotWait('skipElement');
    depth += depthChange(event);
  }
}

/** Like `skipElement()`, awaiting input when an asynchronous reader needs it. */
export async function skipElementAsync(reader: Navigable): Promise<void> {
  if (reader.eventType() !== START_ELEMENT)
    throw ErrorFactory.create(IllegalStateError, 'skipElementAsync() needs a START_ELEMENT');
  for (let depth = 1; depth > 0;) {
    const event = reader.next();
    // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
    if (event === NEED_INPUT) await reader.fill();
    else depth += depthChange(event);
  }
}

/** How an event changes the number of open elements. */
function depthChange(event: EventType): number {
  if (event === START_ELEMENT) return 1;
  return event === END_ELEMENT ? -1 : 0;
}

/** The text an event inside a text-only element adds; a child element fails, naming the `method` that met it. */
function elementTextPart(reader: Navigable, event: EventType, method: string): string {
  if (event === START_ELEMENT) throw ErrorFactory.create(IllegalStateError, `${method}() found a child element`);
  if (isCharacterData(event)) return reader.text();
  return '';
}

/** The error a synchronous helper throws when the reader has to wait for input. */
function cannotWait(method: string): Error {
  return ErrorFactory.create(
    IllegalStateError,
    `${method}() cannot wait for input; use ${method}Async() with an asynchronous reader`
  );
}

/** Calls `handle` for each event to the end of the document, awaiting input as it is needed. */
export async function forEachEvent<R extends Navigable>(
  reader: R,
  handle: (type: Exclude<EventType, typeof EventType.NEED_INPUT>, reader: R) => void
): Promise<void> {
  for (let type = reader.next(); ; type = reader.next()) {
    if (type === NEED_INPUT) {
      await reader.fill();
      continue;
    }
    handle(type, reader);
    if (type === END_DOCUMENT) return;
  }
}

/** The part of a reader that finds an attribute by name. */
interface WithAttributes {
  attributeCount(): number;

  attributeLocalName(index: number): string;

  attributeNamespace(index: number): string;

  attributeValue(index: number): string;
}

/** The value of the attribute with a local name and namespace URI, read through the reader's own accessors. */
export function attributeNamed(reader: WithAttributes, localName: string, namespaceURI: string): string | undefined {
  for (let i = 0; i < reader.attributeCount(); i++) {
    if (reader.attributeLocalName(i) === localName && reader.attributeNamespace(i) === namespaceURI) {
      return reader.attributeValue(i);
    }
  }
  return undefined;
}
