import { AsyncEventReader, EventType, type StartElementEvent, type XMLEvent } from '@exemplarjs/xml';
import { XMLNS_NAMESPACE } from '@exemplarjs/xml/internal';
import type { StreamWriter } from './stream-writer.ts';

/** How many of an async iterable's events are written between waits for the destination to have room. */
const EVENTS_PER_DRAIN = 1024;

/**
 * Writes event objects, following StAX's `XMLEventWriter`: one at a time, or all that an event
 * reader, a generator or any other iterable gives, so that a document can be copied and changed on
 * the way.
 */
export class EventWriter {
  readonly #writer: StreamWriter;

  constructor(writer: StreamWriter) {
    this.#writer = writer;
  }

  /** Writes one event. */
  add(event: XMLEvent): void;
  /** Writes every event an event reader, a generator or any other iterable gives. */
  add(events: Iterable<XMLEvent>): void;
  add(eventOrEvents: XMLEvent | Iterable<XMLEvent>): void {
    if (!(Symbol.iterator in eventOrEvents)) {
      this.#write(eventOrEvents);
      return;
    }
    for (const event of eventOrEvents) this.#write(event);
  }

  /**
   * Writes every event an asynchronous event reader or any async iterable gives, waiting for the
   * destination to have room after each batch an event reader gives, or every so many events.
   */
  async addAsync(events: AsyncEventReader | AsyncIterable<XMLEvent>): Promise<void> {
    if (events instanceof AsyncEventReader) {
      for await (const batch of events.batches()) {
        for (const event of batch) this.#write(event);
        await this.#writer.drain();
      }
      return;
    }
    let written = 0;
    for await (const event of events) {
      this.#write(event);
      written++;
      if (written % EVENTS_PER_DRAIN === 0) await this.#writer.drain();
    }
  }

  /** Writes one event by the stream writer call it matches. */
  #write(event: XMLEvent): void {
    const writer = this.#writer;
    switch (event.type) {
      case EventType.START_ELEMENT: {
        this.#startElement(event);
        break;
      }
      case EventType.END_ELEMENT: {
        // A name without a prefix is its local name, which needs no new string.
        writer.writeEndElement(event.name.prefix === '' ? event.name.localName : event.name.toString());
        break;
      }
      case EventType.CHARACTERS:
      case EventType.SPACE: {
        writer.writeCharacters(event.text);
        break;
      }
      case EventType.CDATA: {
        writer.writeCData(event.text);
        break;
      }
      case EventType.COMMENT: {
        writer.writeComment(event.text);
        break;
      }
      case EventType.PROCESSING_INSTRUCTION: {
        writer.writeProcessingInstruction(event.target, event.data);
        break;
      }
      case EventType.DTD: {
        writer.writeDTD(event.text);
        break;
      }
      case EventType.ENTITY_REFERENCE: {
        writer.writeEntityRef(event.name);
        break;
      }
      case EventType.START_DOCUMENT: {
        writer.writeStartDocument(event.version ?? '1.0', undefined, event.standalone);
        break;
      }
      case EventType.START_ENTITY:
      case EventType.END_ENTITY: {
        // The expanded content is written; its boundaries add nothing.
        break;
      }
      default: {
        writer.writeEndDocument();
      }
    }
  }

  /** Writes a start tag with its namespace declarations and attributes. */
  #startElement(event: StartElementEvent): void {
    const writer = this.#writer;
    const { prefix, localName, namespaceURI } = event.name;
    writer.writeStartElement(prefix, localName, namespaceURI);
    for (const namespace of event.namespaces) writer.writeNamespace(namespace.prefix, namespace.namespaceURI);
    for (const attribute of event.attributes) {
      // Declarations reported as attributes are written from the namespaces already.
      if (attribute.namespaceURI !== XMLNS_NAMESPACE) {
        writer.writeAttribute(attribute.prefix, attribute.localName, attribute.namespaceURI, attribute.value);
      }
    }
  }

  /** Hands what has been written to the sink. */
  flush(): void {
    this.#writer.flush();
  }

  /** Resolves when the destination has room for more, as the stream writer's `drain()` does. */
  drain(): Promise<void> {
    return this.#writer.drain();
  }

  /** Flushes and closes the sink. */
  close(): Promise<void> {
    return this.#writer.close();
  }
}
