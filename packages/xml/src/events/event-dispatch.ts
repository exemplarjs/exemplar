import { EventType } from '@/cursor/event-type';
import type { Doctype } from '@/cursor/stream-reader';
import type { EntityDeclaration } from '@/dtd/declarations';
import type { SAXAttributes, SAXLocator } from '@/util/structure';
import { resolveTargetURI } from '@/util/uri';
import { AsyncEventReader } from './event-reader.ts';
import type { Attribute, CharactersEvent, EndElementEvent, StartElementEvent, XMLEvent } from './events.ts';

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
  ENTITY_REFERENCE,
  DTD,
  CDATA,
  START_ENTITY,
  END_ENTITY,
} = EventType;

/** The events other than an element's start or end tag or character data. */
type OtherEvent = Exclude<XMLEvent, StartElementEvent | EndElementEvent | CharactersEvent>;

/** The SAX handler methods events are passed to; any SAX handler has them. */
export interface EventHandler {
  setDocumentLocator?(locator: SAXLocator): void;
  startDocument?(): void;
  endDocument?(): void;
  startPrefixMapping?(prefix: string, uri: string): void;
  endPrefixMapping?(prefix: string): void;
  startElement?(uri: string, localName: string, qName: string, attributes: SAXAttributes): void;
  endElement?(uri: string, localName: string, qName: string): void;
  characters?(text: string): void;
  ignorableWhitespace?(text: string): void;
  processingInstruction?(target: string, data: string): void;
  skippedEntity?(name: string): void;
  startDTD?(name: string, publicId: string | undefined, systemId: string | undefined): void;
  endDTD?(): void;
  startEntity?(name: string): void;
  endEntity?(name: string): void;
  startCDATA?(): void;
  endCDATA?(): void;
  comment?(text: string): void;
  internalEntityDecl?(name: string, value: string): void;
  externalEntityDecl?(name: string, publicId: string | undefined, systemId: string): void;
  notationDecl?(name: string, publicId: string | undefined, systemId: string | undefined): void;
  unparsedEntityDecl?(name: string, publicId: string | undefined, systemId: string, notationName: string): void;
}

/** Where the event being passed on is, as a SAX locator reads it. */
class EventLocator implements SAXLocator {
  /** The event being passed on. */
  event: XMLEvent | undefined;
  /** The version the document's start gave. */
  xmlVersion = '1.0';

  get lineNumber(): number {
    return this.event?.location.line ?? 0;
  }

  get columnNumber(): number {
    return this.event?.location.column ?? 0;
  }

  get systemId(): string | undefined {
    return this.event?.location.systemId;
  }
}

/** A start tag event's attributes, read as SAX's `Attributes`. */
class EventAttributes implements SAXAttributes {
  /** The start tag's attributes. */
  list: readonly Attribute[] = [];

  get length(): number {
    return this.list.length;
  }

  uri(index: number): string {
    return (this.list[index] as Attribute).namespaceURI;
  }

  localName(index: number): string {
    return (this.list[index] as Attribute).localName;
  }

  qName(index: number): string {
    return (this.list[index] as Attribute).toString();
  }

  value(index: number): string {
    return (this.list[index] as Attribute).value;
  }

  type(index: number): string {
    return (this.list[index] as Attribute).type;
  }

  isSpecified(index: number): boolean {
    return (this.list[index] as Attribute).specified;
  }
}

/**
 * Passes events to a SAX handler, as a parser would report them: a start tag after the prefix
 * mappings it declares, CDATA as characters between `startCDATA` and `endCDATA`, the DTD's entities
 * and notations as declarations. Events that start with no START_DOCUMENT, such as one element's,
 * are passed on as a document of their own: the handler hears of its start and end.
 */
export class EventDispatcher {
  readonly #handler: EventHandler;
  readonly #locator = new EventLocator();
  readonly #attributes = new EventAttributes();
  #started = false;
  #ended = false;

  constructor(handler: EventHandler) {
    this.#handler = handler;
    handler.setDocumentLocator?.(this.#locator);
  }

  /** Passes every event on, then ends the document if the events did not. */
  dispatchAll(events: Iterable<XMLEvent>): void {
    for (const event of events) this.dispatch(event);
    this.end();
  }

  /** Passes every event on as it arrives, then ends the document if the events did not. */
  async dispatchAllAsync(events: AsyncIterable<XMLEvent> | Iterable<XMLEvent>): Promise<void> {
    if (events instanceof AsyncEventReader) {
      for await (const batch of events.batches()) for (const event of batch) this.dispatch(event);
    } else {
      for await (const event of events) this.dispatch(event);
    }
    this.end();
  }

  /** Passes one event on. */
  dispatch(event: XMLEvent): void {
    const handler = this.#handler;
    this.#locator.event = event;
    if (!this.#started) this.#start(event);
    switch (event.type) {
      case START_ELEMENT: {
        for (const { prefix, namespaceURI } of event.namespaces) handler.startPrefixMapping?.(prefix, namespaceURI);
        this.#attributes.list = event.attributes;
        const { name } = event;
        handler.startElement?.(name.namespaceURI, name.localName, name.toString(), this.#attributes);
        break;
      }
      case END_ELEMENT: {
        const { name } = event;
        handler.endElement?.(name.namespaceURI, name.localName, name.toString());
        for (const { prefix } of event.namespaces) handler.endPrefixMapping?.(prefix);
        break;
      }
      case CHARACTERS: {
        handler.characters?.(event.text);
        break;
      }
      case CDATA: {
        handler.startCDATA?.();
        handler.characters?.(event.text);
        handler.endCDATA?.();
        break;
      }
      case SPACE: {
        handler.ignorableWhitespace?.(event.text);
        break;
      }
      default: {
        this.#otherEvent(event);
      }
    }
  }

  /** Ends the document, unless its END_DOCUMENT has been passed on. */
  end(): void {
    if (this.#ended) return;
    if (!this.#started) this.#start(undefined);
    this.#ended = true;
    this.#handler.endDocument?.();
  }

  /** Notes a START_DOCUMENT's version and encoding or, for events without one, starts the document itself. */
  #start(event: XMLEvent | undefined): void {
    this.#started = true;
    if (event?.type !== START_DOCUMENT) {
      this.#handler.startDocument?.();
      return;
    }
    this.#locator.xmlVersion = event.version ?? '1.0';
  }

  /** Passes on an event other than an element or character data. */
  #otherEvent(event: OtherEvent): void {
    const handler = this.#handler;
    switch (event.type) {
      case START_DOCUMENT: {
        handler.startDocument?.();
        break;
      }
      case END_DOCUMENT: {
        this.#ended = true;
        handler.endDocument?.();
        break;
      }
      case COMMENT: {
        handler.comment?.(event.text);
        break;
      }
      case PROCESSING_INSTRUCTION: {
        handler.processingInstruction?.(event.target, event.data);
        break;
      }
      case DTD: {
        this.#dtd(event.doctype);
        break;
      }
      case ENTITY_REFERENCE: {
        handler.skippedEntity?.(event.name);
        break;
      }
      case START_ENTITY: {
        handler.startEntity?.(event.name);
        break;
      }
      case END_ENTITY: {
        handler.endEntity?.(event.name);
      }
    }
  }

  /** Passes on the DOCTYPE, with its entities and notations as declarations, their system ids made absolute. */
  #dtd(doctype: Doctype): void {
    const handler = this.#handler;
    handler.startDTD?.(doctype.name, doctype.publicId, doctype.systemId);
    for (const notation of doctype.notations) {
      const { systemId } = notation;
      const absolute = systemId === undefined ? undefined : resolveTargetURI(systemId, notation.baseURI);
      handler.notationDecl?.(notation.name, notation.publicId, absolute);
    }
    for (const entity of doctype.entities) {
      const systemId = entity.systemId === undefined ? '' : resolveTargetURI(entity.systemId, entity.baseURI);
      declareEntity(handler, entity.name, entity, systemId);
    }
    handler.endDTD?.();
  }
}

/** Reports an entity declaration as SAX does: internal with its value, or external or unparsed with `systemId`. */
export function declareEntity(handler: EventHandler, name: string, entity: EntityDeclaration, systemId: string): void {
  if (entity.value !== undefined) handler.internalEntityDecl?.(name, entity.value);
  else if (entity.notation === undefined) handler.externalEntityDecl?.(name, entity.publicId, systemId);
  else handler.unparsedEntityDecl?.(name, entity.publicId, systemId, entity.notation);
}
