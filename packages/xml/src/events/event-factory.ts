import { EventType } from '@/cursor/event-type';
import type { Location } from '@/errors/xml-error';
import { NOWHERE } from '@/util/structure';
import {
  Attribute,
  type CharactersEvent,
  type CommentEvent,
  type EndDocumentEvent,
  type EndElementEvent,
  type EntityReferenceEvent,
  Event,
  type EventDetails,
  type EventName,
  type Namespace,
  NO_ATTRIBUTES,
  NO_NAMESPACES,
  type ProcessingInstructionEvent,
  QName,
  type StartDocumentEvent,
  type StartElementEvent,
  type XMLEvent,
} from './events.ts';

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
  CDATA,
} = EventType;

/**
 * Makes event objects, as StAX's `XMLEventFactory` does, the same as those an event reader gives.
 * A generator that changes a document's events makes new ones with it:
 *
 * ```ts
 * const eventFactory = new XMLEventFactory();
 * function* stamped(input: Iterable<XMLEvent>): Generator<XMLEvent> {
 *   for (const event of input) {
 *     if (event.type !== EventType.START_ELEMENT) yield event;
 *     else yield eventFactory.createStartElement(event.name, [...event.attributes, eventFactory.createAttribute('seen', 'yes')], event.namespaces);
 *   }
 * }
 * ```
 *
 * The events it makes are where `setLocation` last put them, or nowhere in particular.
 */
export class XMLEventFactory {
  #location: Location = NOWHERE;

  /** Places the events made from now on, as errors about them report; undefined for nowhere in particular. */
  setLocation(location: Location | undefined): void {
    this.#location = location ?? NOWHERE;
  }

  /** The start of a document, with what its XML declaration would say. */
  createStartDocument(encoding?: string, version?: string, standalone?: boolean): StartDocumentEvent {
    const details = { version, encoding, standalone };
    return this.#event(START_DOCUMENT, undefined, '', details) as StartDocumentEvent;
  }

  /** The end of a document. */
  createEndDocument(): EndDocumentEvent {
    return this.#event(END_DOCUMENT, undefined, '') as EndDocumentEvent;
  }

  /** A start tag, by name or by prefix, namespace URI and local name, with its attributes and the namespaces it declares. */
  createStartElement(
    name: QName,
    attributes?: Iterable<Attribute>,
    namespaces?: Iterable<Namespace>
  ): StartElementEvent;
  createStartElement(
    prefix: string,
    namespaceURI: string,
    localName: string,
    attributes?: Iterable<Attribute>,
    namespaces?: Iterable<Namespace>
  ): StartElementEvent;
  createStartElement(
    first: QName | string,
    second?: Iterable<Attribute> | string,
    third?: Iterable<Namespace> | string,
    fourth?: Iterable<Attribute>,
    fifth?: Iterable<Namespace>
  ): StartElementEvent {
    const byName = typeof first !== 'string';
    const name = byName ? first : new QName(second as string, third as string, first);
    const attributes = (byName ? second : fourth) as Iterable<Attribute> | undefined;
    const namespaces = (byName ? third : fifth) as Iterable<Namespace> | undefined;
    return this.#event(
      START_ELEMENT,
      name,
      '',
      undefined,
      attributes === undefined ? NO_ATTRIBUTES : [...attributes],
      namespaces === undefined ? NO_NAMESPACES : [...namespaces]
    ) as StartElementEvent;
  }

  /** An end tag, by name or by prefix, namespace URI and local name, with the namespaces going out of scope. */
  createEndElement(name: QName, namespaces?: Iterable<Namespace>): EndElementEvent;
  createEndElement(
    prefix: string,
    namespaceURI: string,
    localName: string,
    namespaces?: Iterable<Namespace>
  ): EndElementEvent;
  createEndElement(
    first: QName | string,
    second?: Iterable<Namespace> | string,
    third?: string,
    fourth?: Iterable<Namespace>
  ): EndElementEvent {
    const byName = typeof first !== 'string';
    const name = byName ? first : new QName(second as string, third as string, first);
    const namespaces = (byName ? second : fourth) as Iterable<Namespace> | undefined;
    return this.#event(
      END_ELEMENT,
      name,
      '',
      undefined,
      NO_ATTRIBUTES,
      namespaces === undefined ? NO_NAMESPACES : [...namespaces]
    ) as EndElementEvent;
  }

  /** An attribute, by local name, by name, or by prefix, namespace URI and local name; of type CDATA, and specified. */
  createAttribute(localName: string, value: string): Attribute;
  createAttribute(name: QName, value: string): Attribute;
  createAttribute(prefix: string, namespaceURI: string, localName: string, value: string): Attribute;
  createAttribute(first: string | QName, second: string, third?: string, fourth?: string): Attribute {
    if (typeof first !== 'string')
      return new Attribute(first.namespaceURI, first.localName, first.prefix, second, 'CDATA', true);
    if (third === undefined) return new Attribute('', first, '', second, 'CDATA', true);
    return new Attribute(second, third, first, fourth as string, 'CDATA', true);
  }

  /** A namespace declaration: of the default namespace, or of a prefix. */
  createNamespace(namespaceURI: string): Namespace;
  createNamespace(prefix: string, namespaceURI: string): Namespace;
  createNamespace(first: string, second?: string): Namespace {
    return second === undefined ? { prefix: '', namespaceURI: first } : { prefix: first, namespaceURI: second };
  }

  /** Text. */
  createCharacters(text: string): CharactersEvent {
    return this.#event(CHARACTERS, undefined, text) as CharactersEvent;
  }

  /** A CDATA section. */
  createCData(text: string): CharactersEvent {
    return this.#event(CDATA, undefined, text) as CharactersEvent;
  }

  /** Whitespace in element content, which only a validator can tell apart from text. */
  createIgnorableSpace(text: string): CharactersEvent {
    return this.#event(SPACE, undefined, text) as CharactersEvent;
  }

  /** A comment. */
  createComment(text: string): CommentEvent {
    return this.#event(COMMENT, undefined, text) as CommentEvent;
  }

  /** A processing instruction. */
  createProcessingInstruction(target: string, data: string): ProcessingInstructionEvent {
    return this.#event(PROCESSING_INSTRUCTION, target, data) as ProcessingInstructionEvent;
  }

  /** A reference to an entity that is not expanded; `text` is its replacement text, when known. */
  createEntityReference(name: string, text = ''): EntityReferenceEvent {
    return this.#event(ENTITY_REFERENCE, name, text) as EntityReferenceEvent;
  }

  /** An event, where `setLocation` last put them. */
  #event(
    type: EventType,
    name: EventName,
    text: string,
    details?: EventDetails,
    attributes: readonly Attribute[] = NO_ATTRIBUTES,
    namespaces: readonly Namespace[] = NO_NAMESPACES
  ): XMLEvent {
    const location = this.#location;
    return new Event(
      type,
      name,
      attributes,
      namespaces,
      text,
      details,
      location,
      location.offset
    ) as unknown as XMLEvent;
  }
}
