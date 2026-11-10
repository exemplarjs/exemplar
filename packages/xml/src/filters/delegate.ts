import type { EventType } from '@/cursor/event-type';
import * as navigation from '@/cursor/navigation';
import type { AsyncStreamReader, StreamReader } from '@/cursor/readers';
import type { StreamReader as Cursor, Doctype } from '@/cursor/stream-reader';
import type { Location } from '@/errors/xml-error';
import { ErrorFactory, IllegalStateError } from '@/util/errors';

/** The parent of a delegate made without one: every use of it says the delegate needs a parent first. */
const NO_PARENT = new Proxy(
  {},
  {
    get(): never {
      throw ErrorFactory.create(IllegalStateError, 'The delegate has no parent to read yet: set its parent first');
    },
  }
) as StreamReader;

/**
 * Forwards calls to a parent reader, as StAX's `StreamReaderDelegate` does. A method calls the
 * parent's method of the same name, so `StreamReader` documents what each does; a subclass
 * overrides the ones it wants to change:
 *
 * ```ts
 * class Shouting extends StreamReaderDelegate {
 *   override text(): string {
 *     return super.text().toUpperCase();
 *   }
 * }
 * const document = new XdmDocumentBuilder().parse(new Shouting(factory.createStreamReader(source)));
 * ```
 *
 * `nextTag`, `elementText` and `forEachEvent` read through the delegate's own `next()`, so an
 * override of `next()` applies to them too. Every API that takes a reader takes a delegate. To skip
 * events, a filter (`createFilteredReader`) is faster.
 *
 * A delegate can be made without a parent and given one before it is read, by setting `parent` or
 * with `createDelegatedReader`, which stacks several delegates on a reader.
 */
export class StreamReaderDelegate {
  /** The reader calls are forwarded to; set it before reading, not part way through a document. */
  parent: StreamReader | AsyncStreamReader | StreamReaderDelegate;

  constructor(parent: StreamReader | AsyncStreamReader | StreamReaderDelegate = NO_PARENT) {
    this.parent = parent;
  }

  fill(): Promise<void> {
    return (this.parent as AsyncStreamReader).fill();
  }

  feed(chunk: Uint8Array): void {
    return (this.parent as AsyncStreamReader).feed(chunk);
  }

  endOfInput(): void {
    return (this.parent as AsyncStreamReader).endOfInput();
  }

  next(): EventType {
    return this.parent.next();
  }

  hasNext(): boolean {
    return this.parent.hasNext();
  }

  eventType(): EventType {
    return this.parent.eventType();
  }

  close(): void {
    return this.parent.close();
  }

  name(): string {
    return this.parent.name();
  }

  localName(): string {
    return this.parent.localName();
  }

  prefix(): string {
    return this.parent.prefix();
  }

  namespaceURI(index?: number): string {
    return this.parent.namespaceURI(index);
  }

  namespaceCount(): number {
    return this.parent.namespaceCount();
  }

  namespacePrefix(index: number): string {
    return this.parent.namespacePrefix(index);
  }

  attributeCount(): number {
    return this.parent.attributeCount();
  }

  attributeName(index: number): string {
    return this.parent.attributeName(index);
  }

  attributeLocalName(index: number): string {
    return this.parent.attributeLocalName(index);
  }

  attributePrefix(index: number): string {
    return this.parent.attributePrefix(index);
  }

  attributeNamespace(index: number): string {
    return this.parent.attributeNamespace(index);
  }

  attributeType(index: number): string {
    return this.parent.attributeType(index);
  }

  isAttributeSpecified(index: number): boolean {
    return this.parent.isAttributeSpecified(index);
  }

  attributeValue(index: number): string {
    return this.parent.attributeValue(index);
  }

  /** Finds the attribute through the delegate's own accessors, so it gives what an override of them gives. */
  attribute(localName: string, namespaceURI = ''): string | undefined {
    return navigation.attributeNamed(this, localName, namespaceURI);
  }

  text(): string {
    return this.parent.text();
  }

  isWhitespace(): boolean {
    return this.parent.isWhitespace();
  }

  piTarget(): string {
    return this.parent.piTarget();
  }

  piData(): string {
    return this.parent.piData();
  }

  doctype(): Doctype {
    return this.parent.doctype();
  }

  version(): string | undefined {
    return this.parent.version();
  }

  encoding(): string | undefined {
    return this.parent.encoding();
  }

  declaredEncoding(): string | undefined {
    return this.parent.declaredEncoding();
  }

  standalone(): boolean | undefined {
    return this.parent.standalone();
  }

  location(): Location {
    return this.parent.location();
  }

  nextTag(): EventType {
    return navigation.nextTag(this);
  }

  elementText(): string {
    return navigation.elementText(this);
  }

  nextTagAsync(): Promise<EventType> {
    return navigation.nextTagAsync(this);
  }

  elementTextAsync(): Promise<string> {
    return navigation.elementTextAsync(this);
  }

  skipElement(): void {
    navigation.skipElement(this);
  }

  skipElementAsync(): Promise<void> {
    return navigation.skipElementAsync(this);
  }

  forEachEvent(handle: (type: Exclude<EventType, typeof EventType.NEED_INPUT>, reader: this) => void): Promise<void> {
    return navigation.forEachEvent(this, handle);
  }
}

/** The cursor a reader reads with: the reader itself, or the one at the bottom of a chain of delegates. @internal */
export function cursorOf(reader: Cursor | StreamReaderDelegate): Cursor {
  let cursor = reader;
  while (cursor instanceof StreamReaderDelegate) cursor = cursor.parent as Cursor | StreamReaderDelegate;
  return cursor;
}
