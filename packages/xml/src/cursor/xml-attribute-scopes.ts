import type { ElementStack } from './element-stack.ts';

/**
 * The `xml:` attributes of the open elements, such as `xml:lang` and `xml:base`, which an element
 * canonicalized on its own takes on from its ancestors. Few elements have any, so the start tags
 * read add nothing here unless they have some. Each attribute is kept with its element's serial
 * number, so that one whose element has ended is known by its serial no longer being open.
 */
export class XmlAttributeScopes {
  readonly #elements: ElementStack;
  /** The depth and serial number of each noted attribute's element, outermost first; entries past `#count` are spent. */
  readonly #depths: number[] = [];
  readonly #serials: number[] = [];
  /** Each noted attribute's qualified name and value. */
  readonly #names: string[] = [];
  readonly #values: string[] = [];
  /** How many attributes are noted. */
  #count = 0;

  constructor(elements: ElementStack) {
    this.#elements = elements;
  }

  /** Notes an `xml:` attribute of the element at `elementDepth`, in place of those of elements that have ended there or below. */
  note(elementDepth: number, name: string, value: string): void {
    const serial = this.#elements.serials[elementDepth] as number;
    const depths = this.#depths;
    const serials = this.#serials;
    let count = this.#count;
    while (count > 0 && (depths[count - 1] as number) >= elementDepth && serials[count - 1] !== serial) count--;
    depths[count] = elementDepth;
    serials[count] = serial;
    this.#names[count] = name;
    this.#values[count] = value;
    this.#count = count + 1;
  }

  /** The attributes of the open elements above `elementDepth`, outermost first, as qualified name and value. */
  above(elementDepth: number): [string, string][] {
    const serials = this.#elements.serials;
    const attributes: [string, string][] = [];
    for (let i = 0; i < this.#count; i++) {
      const depth = this.#depths[i] as number;
      if (depth < elementDepth && serials[depth] === this.#serials[i]) {
        attributes.push([this.#names[i] as string, this.#values[i] as string]);
      }
    }
    return attributes;
  }
}
