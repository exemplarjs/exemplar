import { attributeIndex, ErrorFactory } from '@exemplarjs/xml/internal';
import type { Attributes } from './handler.ts';

/** One attribute an `AttributesImpl` holds. */
interface Held {
  uri: string;
  localName: string;
  qName: string;
  type: string;
  value: string;
  specified: boolean;
}

/**
 * A list of attributes that can be built and changed, as SAX's `AttributesImpl` and `Attributes2Impl`
 * are. A filter copies the attributes it is given, changes the copy, and passes it on, as the
 * attributes `startElement` receives are valid only during that call:
 *
 * ```ts
 * class Stamp extends XMLFilterImpl {
 *   override startElement(uri: string, localName: string, qName: string, attributes: Attributes) {
 *     const changed = new AttributesImpl(attributes);
 *     changed.addAttribute('', 'checked', 'checked', 'CDATA', 'yes');
 *     super.startElement(uri, localName, qName, changed);
 *   }
 * }
 * ```
 */
export class AttributesImpl implements Attributes {
  /** The attributes held, in the first `#count` places; the array keeps its size when attributes go. */
  readonly #held: Held[] = [];
  #count = 0;

  /** A list holding a copy of the attributes given, or an empty one. */
  constructor(attributes?: Attributes) {
    if (attributes !== undefined) this.setAttributes(attributes);
  }

  get length(): number {
    return this.#count;
  }

  localName(index: number): string {
    return this.#at(index).localName;
  }

  uri(index: number): string {
    return this.#at(index).uri;
  }

  qName(index: number): string {
    return this.#at(index).qName;
  }

  value(index: number): string;
  value(qName: string): string | undefined;
  value(uri: string, localName: string): string | undefined;
  value(indexOrName: number | string, localName?: string): string | undefined {
    if (typeof indexOrName === 'number') return this.#at(indexOrName).value;
    return this.#held[attributeIndex(this, indexOrName, localName)]?.value;
  }

  type(index: number): string {
    return this.#at(index).type;
  }

  isSpecified(index: number): boolean {
    return this.#at(index).specified;
  }

  index(qName: string): number;
  index(uri: string, localName: string): number;
  index(qNameOrURI: string, localName?: string): number {
    return attributeIndex(this, qNameOrURI, localName);
  }

  /** Adds an attribute at the end, as specified in the start tag. */
  addAttribute(uri: string, localName: string, qName: string, type: string, value: string): void {
    this.#held[this.#count++] = { uri, localName, qName, type, value, specified: true };
  }

  /** Replaces the attribute at an index. */
  setAttribute(index: number, uri: string, localName: string, qName: string, type: string, value: string): void {
    this.#at(index);
    this.#held[index] = { uri, localName, qName, type, value, specified: true };
  }

  /** Replaces every attribute with a copy of those given. */
  setAttributes(attributes: Attributes): void {
    this.clear();
    const length = attributes.length;
    for (let i = 0; i < length; i++) {
      this.#held[i] = {
        uri: attributes.uri(i),
        localName: attributes.localName(i),
        qName: attributes.qName(i),
        type: attributes.type(i),
        value: attributes.value(i),
        specified: attributes.isSpecified(i),
      };
    }
    this.#count = length;
  }

  /** Removes the attribute at an index; those after it move down one. */
  removeAttribute(index: number): void {
    this.#at(index);
    this.#held.splice(index, 1);
    this.#count--;
  }

  /** Removes every attribute. */
  clear(): void {
    this.#count = 0;
  }

  setURI(index: number, uri: string): void {
    this.#at(index).uri = uri;
  }

  setLocalName(index: number, localName: string): void {
    this.#at(index).localName = localName;
  }

  setQName(index: number, qName: string): void {
    this.#at(index).qName = qName;
  }

  setType(index: number, type: string): void {
    this.#at(index).type = type;
  }

  setValue(index: number, value: string): void {
    this.#at(index).value = value;
  }

  /** Sets whether the attribute at an index was in the start tag rather than defaulted from the DTD. */
  setSpecified(index: number, specified: boolean): void {
    this.#at(index).specified = specified;
  }

  /** The attribute at an index; a RangeError when there is none. */
  #at(index: number): Held {
    const held = this.#held[index];
    if (held === undefined || index >= this.#count)
      throw ErrorFactory.create(RangeError, `Attribute index ${index} is out of range`);
    return held;
  }
}
