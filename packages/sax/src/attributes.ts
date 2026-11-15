import { attributeIndex, type StreamReader, XMLNS_NAMESPACE } from '@exemplarjs/xml/internal';
import type { Attributes } from './handler.ts';

/** The cursor's current start tag's attributes, read through SAX's `Attributes`; each method asks the cursor, so nothing is copied. */
export class ReaderAttributes implements Attributes {
  readonly #reader: StreamReader;
  readonly #namespaceAware: boolean;

  constructor(reader: StreamReader, namespaceAware: boolean) {
    this.#reader = reader;
    this.#namespaceAware = namespaceAware;
  }

  get length(): number {
    return this.#reader.attributeCount();
  }

  localName(index: number): string {
    return this.#namespaceAware ? this.#reader.attributeLocalName(index) : '';
  }

  uri(index: number): string {
    return this.#reader.attributeNamespace(index);
  }

  qName(index: number): string {
    return this.#reader.attributeName(index);
  }

  value(index: number): string;
  value(qName: string): string | undefined;
  value(uri: string, localName: string): string | undefined;
  value(indexOrURI: number | string, localName?: string): string | undefined {
    if (typeof indexOrURI === 'number') return this.#reader.attributeValue(indexOrURI);
    const index = this.index(indexOrURI, localName as string);
    return index < 0 ? undefined : this.#reader.attributeValue(index);
  }

  type(index: number): string {
    return this.#reader.attributeType(index);
  }

  isSpecified(index: number): boolean {
    return this.#reader.isAttributeSpecified(index);
  }

  index(qName: string): number;
  index(uri: string, localName: string): number;
  index(qNameOrURI: string, localName?: string): number {
    if (localName === undefined || this.#namespaceAware) return attributeIndex(this, qNameOrURI, localName);
    // Without namespaces, an attribute's whole name is its local name, in no namespace.
    return qNameOrURI === '' ? attributeIndex(this, localName) : -1;
  }
}

/** `ReaderAttributes` with `xmlns` attributes in no namespace and with no local name, as SAX2 has them while `xmlns-uris` is off. */
export class NoXmlnsURIAttributes extends ReaderAttributes {
  /** An attribute's namespace URI; empty for `xmlns` attributes. */
  override uri(index: number): string {
    const uri = super.uri(index);
    return uri === XMLNS_NAMESPACE ? '' : uri;
  }

  /** An attribute's local name; empty for `xmlns` attributes, as in the JDK. */
  override localName(index: number): string {
    return super.uri(index) === XMLNS_NAMESPACE ? '' : super.localName(index);
  }
}
