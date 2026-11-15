import { declaredPrefixOf, prefixOf, type SAXAttributes, type SAXLocator } from '@exemplarjs/xml/internal';
import { doctypeDeclaration } from './escape.ts';
import type { StreamWriter } from './stream-writer.ts';

/**
 * A SAX handler that writes the events it is given as XML, as `XMLOutputFactory.createSAXHandler()`
 * makes one. It ends a chain of SAX filters, so that what they change is what is written:
 *
 * ```ts
 * const sink = new StringSink();
 * new SAXParser().parse(source, new RenamingFilter(output.createSAXHandler(sink)));
 * sink.toString();
 * ```
 *
 * The stream writer checks what it writes, as it does for any caller, and a prefix an element or
 * attribute uses without a mapping in scope is declared on it. Events without namespaces whose
 * names have colons need a factory with `namespaceAware: false`. The DOCTYPE keeps the DTD's public
 * and system ids, but not its internal subset, whose entities and defaults the events have applied;
 * an entity the parser skipped is left out, as nothing would declare it. `endDocument` hands
 * everything to the destination; a web stream also needs `close()`.
 */
export class WritingHandler {
  /** The stream writer the events are written with. */
  readonly writer: StreamWriter;
  #locator: SAXLocator | undefined;
  /** The prefix mappings for the next start tag. */
  readonly #pendingPrefixes: string[] = [];
  readonly #pendingURIs: string[] = [];
  #inDTD = false;
  /** The text of the CDATA section being read, or undefined outside one. */
  #cdata: string | undefined;

  /** A handler that writes with `writer`. @internal */
  constructor(writer: StreamWriter) {
    this.writer = writer;
  }

  setDocumentLocator(locator: SAXLocator): void {
    this.#locator = locator;
  }

  startDocument(): void {
    this.writer.writeStartDocument(this.#locator?.xmlVersion ?? '1.0');
  }

  endDocument(): void {
    this.writer.writeEndDocument();
  }

  /** Flushes the output and closes the destination, waiting for a web stream to take everything. */
  close(): Promise<void> {
    return this.writer.close();
  }

  startPrefixMapping(prefix: string, uri: string): void {
    this.#pendingPrefixes.push(prefix);
    this.#pendingURIs.push(uri);
  }

  startElement(uri: string, localName: string, qName: string, attributes: SAXAttributes): void {
    const writer = this.writer;
    // Events without namespaces have neither a local name nor a URI.
    const namespaceAware = localName !== '' || uri !== '';
    const prefix = prefixOf(qName);
    if (namespaceAware) writer.writeStartElement(prefix, localName, uri);
    else writer.writeStartElement(qName);
    const prefixes = this.#pendingPrefixes;
    for (let i = 0; i < prefixes.length; i++)
      writer.writeNamespace(prefixes[i] as string, this.#pendingURIs[i] as string);
    if (namespaceAware) this.#declareIfUnbound(prefix, uri);
    for (let i = 0; i < attributes.length; i++) this.#attribute(attributes, i, namespaceAware);
    if (prefixes.length > 0) {
      prefixes.length = 0;
      this.#pendingURIs.length = 0;
    }
  }

  endElement(_uri: string, _localName: string, qName: string): void {
    this.writer.writeEndElement(qName);
  }

  characters(text: string): void {
    if (this.#cdata === undefined) this.writer.writeCharacters(text);
    else this.#cdata += text;
  }

  ignorableWhitespace(text: string): void {
    this.writer.writeCharacters(text);
  }

  startCDATA(): void {
    this.#cdata = '';
  }

  endCDATA(): void {
    this.writer.writeCData(this.#cdata ?? '');
    this.#cdata = undefined;
  }

  comment(text: string): void {
    if (!this.#inDTD) this.writer.writeComment(text);
  }

  processingInstruction(target: string, data: string): void {
    if (!this.#inDTD) this.writer.writeProcessingInstruction(target, data);
  }

  startDTD(name: string, publicId: string | undefined, systemId: string | undefined): void {
    this.#inDTD = true;
    if (systemId !== undefined) this.writer.writeDTD(doctypeDeclaration(name, publicId, systemId));
  }

  endDTD(): void {
    this.#inDTD = false;
  }

  /** Writes attribute `index`; a declaration reported as an attribute is written once, from the mappings if they have it. */
  #attribute(attributes: SAXAttributes, index: number, namespaceAware: boolean): void {
    const writer = this.writer;
    const name = attributes.qName(index);
    const value = attributes.value(index);
    if (!namespaceAware) {
      writer.writeAttribute(name, value);
      return;
    }
    const declared = declaredPrefixOf(name);
    if (declared !== undefined) {
      if (!this.#pendingPrefixes.includes(declared)) writer.writeNamespace(declared, value);
      return;
    }
    const uri = attributes.uri(index);
    const prefix = prefixOf(name);
    if (prefix !== '') this.#declareIfUnbound(prefix, uri);
    writer.writeAttribute(prefix, attributes.localName(index), uri, value);
  }

  /** Declares a prefix on the open start tag, unless it is bound to the URI already. */
  #declareIfUnbound(prefix: string, uri: string): void {
    if (prefix !== 'xml' && (this.writer.namespaceOf(prefix) ?? '') !== uri) this.writer.writeNamespace(prefix, uri);
  }
}
