import type { ResolvedOptions } from '@/config/options';
import type { Location } from '@/errors/xml-error';
import { cursorOf, StreamReaderDelegate } from '@/filters/delegate';
import { ErrorFactory, IllegalStateError, InvalidArgumentError } from '@/util/errors';
import { checkName, checkQName, StructureCheck } from '@/util/structure';
import { EventType } from './event-type.ts';
import { LISTEN_ENTITIES, NAMESPACES_IN_SCOPE, READER_OPTIONS } from './internal.ts';
import { NO_BINDINGS, type StreamReader } from './stream-reader.ts';

// Module-level constants, so V8 can inline them.
const {
  START_ELEMENT,
  END_ELEMENT,
  CHARACTERS,
  SPACE,
  CDATA,
  START_DOCUMENT,
  END_DOCUMENT,
  NEED_INPUT,
  START_ENTITY,
  END_ENTITY,
} = EventType;

/** What `#queued` holds when no event waits to be returned. */
const NO_EVENT = 0;
/** What `#queued` holds while an asynchronous reader has still to reach the event it starts from. */
const SETTLING = -1;

/** How a consumer reads a reader. */
export interface ReaderInputOptions {
  /** The consumer, which errors name, such as `XdmDocumentBuilder.parse`. */
  readonly consumer: string;
  /** Whether the consumer waits for input; a synchronous one refuses a reader that has to. */
  readonly mode: 'sync' | 'async';
  /** The reader options the consumer cannot read without. */
  readonly needs?: Partial<Record<keyof ResolvedOptions, boolean>>;
}

/** What reads a reader's events one at a time, such as a tree builder's loader. */
export interface ReaderConsumer {
  /** Takes the event the reader is at; returns true at the end of the input. */
  add(type: EventType): boolean;

  /** Declares on the root just added the namespaces it inherits, when it is an element read on its own. */
  inherit?(bindings: ReadonlyMap<string, string>): void;

  /** Resolves when the consumer can take more; an asynchronous read awaits it before waiting for input. */
  drain?(): Promise<void>;
}

/**
 * The events a consumer, such as a tree builder, reads from a reader it is given, from where the
 * reader stands: from the start of a document, the whole document; from a start tag, that element
 * as a document of its own, stopping at its end tag so that the reader can go on to the next.
 *
 * ```ts
 * const input = new ReaderInput(reader, { consumer: 'XdmDocumentBuilder.parse', mode: 'sync' });
 * input.read(loader);
 * ```
 *
 * Filters and delegates can change what a reader reports, so the events are checked: elements
 * balance, there is one root and no text outside it, and the names a delegate gives are well formed.
 * Whitespace outside the root and entity boundaries are passed over. Once read, the reader stops
 * telling the consumer where entities start and end.
 */
export class ReaderInput {
  readonly reader: StreamReader;
  readonly #options: ReaderInputOptions;
  /** Whether names are checked: only a delegate can change them. */
  readonly #checksNames: boolean;
  readonly #namespaceAware: boolean;
  /** Where the reader is, for the errors the checks throw. */
  readonly #where: () => Location;
  readonly #structure: StructureCheck;
  /** An event to return before reading on, NO_EVENT, or SETTLING. */
  #queued: number = NO_EVENT;
  /** Whether the input is one element rather than a whole document. */
  #isElement = false;
  /** The namespace bindings an element read on its own inherits from its ancestors. */
  #inherited: ReadonlyMap<string, string> = NO_BINDINGS;

  /** Input from a reader for a consumer; throws a TypeError if the reader lacks an option the consumer needs. */
  constructor(reader: StreamReader, options: ReaderInputOptions) {
    this.reader = reader;
    this.#options = options;
    const readerOptions = cursorOf(reader)[READER_OPTIONS];
    for (const [option, value] of Object.entries(options.needs ?? {})) {
      if (readerOptions[option as keyof ResolvedOptions] !== value) {
        throw ErrorFactory.create(
          InvalidArgumentError,
          `${options.consumer} needs a reader with ${option}: ${String(value)}`
        );
      }
    }
    this.#checksNames = reader instanceof StreamReaderDelegate;
    this.#namespaceAware = readerOptions.namespaceAware;
    this.#where = () => reader.location();
    this.#structure = new StructureCheck(this.#where);
  }

  /** Whether the input is one element, read from its start tag, rather than a whole document; known once settled. */
  get isElement(): boolean {
    return this.#isElement;
  }

  /** How many elements are open: 1 once the root's start tag is read, 0 again once its end tag is. */
  get depth(): number {
    return this.#structure.depth;
  }

  /** For an element read on its own, the namespaces its ancestors bind, which its consumer declares on it; else none. */
  get inherited(): ReadonlyMap<string, string> {
    return this.#inherited;
  }

  /** Gives the consumer every event to the end of the input. */
  read(consumer: ReaderConsumer): void {
    try {
      for (let type = this.first(); !this.#give(consumer, type); type = this.next());
    } finally {
      cursorOf(this.reader)[LISTEN_ENTITIES](undefined);
    }
  }

  /** Gives the consumer every event to the end of the input, waiting for input as it is needed. */
  async readAsync(consumer: ReaderConsumer): Promise<void> {
    try {
      for (let type = this.first(); ; type = this.next()) {
        if (type === NEED_INPUT) {
          if (consumer.drain !== undefined) await consumer.drain();
          await this.reader.fill();
        } else if (this.#give(consumer, type)) return;
      }
    } finally {
      cursorOf(this.reader)[LISTEN_ENTITIES](undefined);
    }
  }

  /** Gives the consumer one event, and the root the namespaces it inherits; returns true at the end of the input. */
  #give(consumer: ReaderConsumer, type: EventType): boolean {
    if (consumer.add(type)) return true;
    if (type === START_ELEMENT && this.#structure.depth === 1) consumer.inherit?.(this.#inherited);
    return false;
  }

  /** The first event: START_DOCUMENT, or NEED_INPUT while an asynchronous reader has to read to where it starts. */
  first(): EventType {
    const type = this.reader.eventType();
    if (type !== NEED_INPUT) return this.#settle(type);
    this.#queued = SETTLING;
    return this.#needInput();
  }

  /** The next event, checked. */
  next(): EventType {
    if (this.#queued !== NO_EVENT) return this.#takeQueued();
    for (;;) {
      const type = this.reader.next();
      switch (type) {
        case START_ELEMENT: {
          this.#startElement();
          return type;
        }
        case END_ELEMENT: {
          this.#endElement();
          return type;
        }
        case CHARACTERS:
        case SPACE:
        case CDATA: {
          if (this.#structure.depth > 0) return type;
          this.#structure.outsideRoot(this.reader.isWhitespace());
          continue;
        }
        case START_ENTITY:
        case END_ENTITY: {
          continue;
        }
        case END_DOCUMENT: {
          this.#structure.endDocument();
          return type;
        }
        case NEED_INPUT: {
          return this.#needInput();
        }
        default: {
          // Comments, processing instructions, entity references and the DTD.
          return type;
        }
      }
    }
  }

  /** The queued event, or for SETTLING, the event the reader starts from, once it has the input. */
  #takeQueued(): EventType {
    const queued = this.#queued;
    if (queued === SETTLING) {
      const type = this.reader.next();
      return type === NEED_INPUT ? this.#needInput() : this.#settle(type);
    }
    // The document's end stays queued, so that the reader stays at the element's end tag.
    if (queued === END_DOCUMENT) return END_DOCUMENT;
    this.#queued = NO_EVENT;
    this.#startElement();
    return START_ELEMENT;
  }

  /**
   * Settles what to read from the event the reader stands at. At START_DOCUMENT, the whole document;
   * at a start tag, that element, returning a START_DOCUMENT first and queuing the start tag.
   */
  #settle(type: EventType): EventType {
    this.#queued = NO_EVENT;
    if (type === START_DOCUMENT) return type;
    if (type !== START_ELEMENT) {
      const name = Object.keys(EventType).find((key) => EventType[key as keyof typeof EventType] === type);
      throw ErrorFactory.create(
        IllegalStateError,
        `${this.#options.consumer} reads a reader from the start of a document or of an element, not from ${name}`
      );
    }
    this.#isElement = true;
    this.#queued = START_ELEMENT;
    this.#inherited = inheritedNamespaces(this.reader);
    return START_DOCUMENT;
  }

  /** NEED_INPUT for an asynchronous consumer; a synchronous one cannot wait for it. */
  #needInput(): EventType {
    if (this.#options.mode === 'async') return NEED_INPUT;
    throw ErrorFactory.create(
      InvalidArgumentError,
      `${this.#options.consumer} needs a synchronous reader, or one with its whole input`
    );
  }

  /** Opens an element, checking its names when a delegate may have changed them. */
  #startElement(): void {
    const reader = this.reader;
    this.#structure.startElement(reader.name());
    if (this.#checksNames) this.#checkNames();
  }

  /** Closes an element; at the end of an element read on its own, the document's end follows. */
  #endElement(): void {
    this.#structure.endElement(this.reader.name());
    if (this.#structure.depth === 0 && this.#isElement) this.#queued = END_DOCUMENT;
  }

  /** Checks the names of the reader's start tag, which a delegate may have changed. */
  #checkNames(): void {
    const reader = this.reader;
    const where = this.#where;
    if (!this.#namespaceAware) {
      checkName('element', reader.name(), where);
      for (let i = 0; i < reader.attributeCount(); i++) checkName('attribute', reader.attributeName(i), where);
      return;
    }
    checkQName('element', reader.name(), reader.localName(), reader.prefix(), reader.namespaceURI(), where);
    for (let i = 0; i < reader.attributeCount(); i++) {
      const name = reader.attributeName(i);
      checkQName(
        'attribute',
        name,
        reader.attributeLocalName(i),
        reader.attributePrefix(i),
        reader.attributeNamespace(i),
        where
      );
    }
  }
}

/** The bindings in scope at the reader's start tag that its ancestors made, leaving out `xml` and undeclarations. */
function inheritedNamespaces(reader: StreamReader): ReadonlyMap<string, string> {
  const inherited = new Map(cursorOf(reader)[NAMESPACES_IN_SCOPE]());
  for (let i = 0; i < reader.namespaceCount(); i++) inherited.delete(reader.namespacePrefix(i));
  inherited.delete('xml');
  for (const [prefix, uri] of inherited) if (uri === '') inherited.delete(prefix);
  return inherited;
}
