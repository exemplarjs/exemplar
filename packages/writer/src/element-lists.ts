import { namesElement } from './names.ts';
import type { NamespaceBindings } from './namespaces.ts';

/**
 * The CDATA-section and suppress-indentation element lists of a writer's options, matched against
 * each start tag once its declarations are written, and whether each open element writes its text as CDATA.
 */
export class ElementLists {
  readonly #cdataSectionElements: ReadonlySet<string>;
  readonly #suppressIndentation: ReadonlySet<string>;
  /** Whether neither list names an element, so no start tag needs matching. */
  readonly isEmpty: boolean;
  /** The prefix, local name and given URI of the start tag being written. */
  #prefix = '';
  #localName = '';
  #uri: string | undefined;
  /** For each open element, whether its text is written as CDATA. */
  readonly #writesCData: boolean[] = [];

  constructor(cdataSectionElements: ReadonlySet<string>, suppressIndentation: ReadonlySet<string>) {
    this.#cdataSectionElements = cdataSectionElements;
    this.#suppressIndentation = suppressIndentation;
    this.isEmpty = cdataSectionElements.size === 0 && suppressIndentation.size === 0;
  }

  /** Notes the start tag of an element that opens. */
  open(prefix: string, localName: string, uri: string | undefined): void {
    this.#prefix = prefix;
    this.#localName = localName;
    this.#uri = uri;
    this.#writesCData.push(false);
  }

  /** Forgets the innermost element. */
  close(): void {
    this.#writesCData.pop();
  }

  /** Whether the innermost open element writes its text as CDATA. */
  get writesCData(): boolean {
    return this.#writesCData.at(-1) === true;
  }

  /** Notes whether the start tag just closed, matched by its qualified name and bindings, writes its text as CDATA. */
  noteCData(name: string, bindings: NamespaceBindings): void {
    if (namesElement(this.#cdataSectionElements, name, this.#namespace(bindings), this.#localName)) {
      this.#writesCData[this.#writesCData.length - 1] = true;
    }
  }

  /** Whether the start tag just closed, matched by its qualified name and bindings, suppresses indentation. */
  suppressesIndentation(name: string, bindings: NamespaceBindings): boolean {
    return namesElement(this.#suppressIndentation, name, this.#namespace(bindings), this.#localName);
  }

  /** The namespace URI of the start tag just closed. */
  #namespace(bindings: NamespaceBindings): string {
    return this.#uri ?? bindings.uriOf(this.#prefix) ?? '';
  }
}
