import { type AsyncStreamReader, EventType, type StreamReader as PublicStreamReader } from '@exemplarjs/xml';
import type { StreamReaderDelegate } from '@exemplarjs/xml/filters';
import { ReaderInput, type StreamReader, XMLNS_NAMESPACE } from '@exemplarjs/xml/internal';
import type { StreamWriter } from './stream-writer.ts';

// Module-level constants, so V8 can inline them; imported bindings are read again on every use.
const {
  START_ELEMENT,
  END_ELEMENT,
  PROCESSING_INSTRUCTION,
  CHARACTERS,
  COMMENT,
  SPACE,
  START_DOCUMENT,
  ENTITY_REFERENCE,
  DTD,
  CDATA,
} = EventType;

/** A reader `StreamWriter.copy` can read: a cursor or a delegate. */
export type CopiedReader = PublicStreamReader | AsyncStreamReader | StreamReaderDelegate;

/**
 * Writes what a reader reads, each event by the stream writer call it matches. A whole document is
 * written with its XML declaration and ended; an element read on its own is written as it is, so that
 * it can go inside a document being written.
 */
class ReaderCopy {
  readonly #input: ReaderInput;
  readonly #reader: StreamReader;
  readonly #writer: StreamWriter;

  constructor(input: ReaderInput, writer: StreamWriter) {
    this.#input = input;
    this.#reader = input.reader;
    this.#writer = writer;
  }

  /** Writes the event the reader is at; returns true at the end of the input. */
  add(type: EventType): boolean {
    const reader = this.#reader;
    const writer = this.#writer;
    switch (type) {
      case START_ELEMENT: {
        this.#startElement();
        break;
      }
      case END_ELEMENT: {
        writer.writeEndElement();
        break;
      }
      case CHARACTERS:
      case SPACE: {
        writer.writeCharacters(reader.text());
        break;
      }
      case CDATA: {
        writer.writeCData(reader.text());
        break;
      }
      case COMMENT: {
        writer.writeComment(reader.text());
        break;
      }
      case PROCESSING_INSTRUCTION: {
        writer.writeProcessingInstruction(reader.piTarget(), reader.piData());
        break;
      }
      case DTD: {
        writer.writeDTD(reader.text());
        break;
      }
      case ENTITY_REFERENCE: {
        writer.writeEntityRef(reader.name());
        break;
      }
      case START_DOCUMENT: {
        if (!this.#input.isElement)
          writer.writeStartDocument(reader.version() ?? '1.0', undefined, reader.standalone());
        break;
      }
      default: {
        if (!this.#input.isElement) writer.writeEndDocument();
        return true;
      }
    }
    return false;
  }

  /** Declares on an element read on its own the namespaces it inherits, unless the output has them in scope. */
  inherit(bindings: ReadonlyMap<string, string>): void {
    for (const [prefix, uri] of bindings) {
      if (this.#writer.namespaceOf(prefix) !== uri) this.#writer.writeNamespace(prefix, uri);
    }
  }

  /** Resolves when the destination has room for more; awaited before the reader waits for input. */
  drain(): Promise<void> {
    return this.#writer.drain();
  }

  /** Writes a start tag with its namespace declarations and attributes. */
  #startElement(): void {
    const reader = this.#reader;
    const writer = this.#writer;
    writer.writeStartElement(reader.prefix(), reader.localName(), reader.namespaceURI());
    for (let i = 0; i < reader.namespaceCount(); i++) {
      writer.writeNamespace(reader.namespacePrefix(i), reader.namespaceURI(i));
    }
    for (let i = 0; i < reader.attributeCount(); i++) {
      const uri = reader.attributeNamespace(i);
      // Declarations reported as attributes are written from the namespaces already.
      if (uri !== XMLNS_NAMESPACE) {
        writer.writeAttribute(reader.attributePrefix(i), reader.attributeLocalName(i), uri, reader.attributeValue(i));
      }
    }
  }
}

/** Writes what a reader with its whole input reads, from where it stands. */
export function copyReader(writer: StreamWriter, reader: CopiedReader): void {
  const input = new ReaderInput(reader as StreamReader, { consumer: 'StreamWriter.copy', mode: 'sync' });
  input.read(new ReaderCopy(input, writer));
}

/** Writes what a reader reads, from where it stands, waiting for its input and for the destination to have room. */
export function copyReaderAsync(writer: StreamWriter, reader: CopiedReader): Promise<void> {
  const input = new ReaderInput(reader as StreamReader, { consumer: 'StreamWriter.copyAsync', mode: 'async' });
  return input.readAsync(new ReaderCopy(input, writer));
}
