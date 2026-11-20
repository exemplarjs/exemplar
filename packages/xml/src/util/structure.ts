import { ErrorCode } from '@/errors/codes';
import { type Location, XMLError } from '@/errors/xml-error';
import { ErrorFactory } from './errors.ts';

/** Where something with no location is, such as an event made in code: nowhere in particular. */
export const NOWHERE: Location = Object.freeze({ line: 0, column: 0, offset: 0 });

/** The parts of SAX's `Attributes` that code turning SAX events into a tree or a document reads. */
export interface SAXAttributes {
  readonly length: number;
  uri(index: number): string;
  localName(index: number): string;
  qName(index: number): string;
  value(index: number): string;
  type(index: number): string;
  isSpecified(index: number): boolean;
}

/** The parts of SAX's `Locator2` that code turning SAX events into a tree or a document reads. */
export interface SAXLocator {
  readonly lineNumber: number;
  readonly columnNumber: number;
  readonly systemId: string | undefined;
  readonly xmlVersion: string;
}

/** Where a SAX locator says the events are; nowhere in particular without one. */
export function locationOf(locator: Omit<SAXLocator, 'xmlVersion'> | undefined): Location {
  if (locator === undefined) return NOWHERE;
  const where = { line: locator.lineNumber, column: locator.columnNumber, offset: 0 };
  return locator.systemId === undefined ? where : { ...where, systemId: locator.systemId };
}

/**
 * Checks that a document given an event at a time, by a filter, a delegate or a SAX handler's
 * caller, is well formed: its elements balance with matching end tags, it has one root, and no text
 * outside it. A failed check throws an `XMLError` with the code a parser would give, at the location
 * `where` gives.
 *
 * ```ts
 * const check = new StructureCheck(() => reader.location());
 * check.startElement('a');
 * check.endElement('b'); // throws WF_END_TAG_MISMATCH
 * ```
 */
export class StructureCheck {
  readonly #where: () => Location;
  /** The open elements' names, which their end tags must match. */
  readonly #openNames: string[] = [];
  #sawRoot = false;

  constructor(where: () => Location) {
    this.#where = where;
  }

  /** How many elements are open. */
  get depth(): number {
    return this.#openNames.length;
  }

  /** Opens an element: the root, unless one has been seen already. */
  startElement(name: string): void {
    if (this.#openNames.length === 0) {
      if (this.#sawRoot) this.#fail(ErrorCode.WF_SECOND_ROOT, 'A second root element');
      this.#sawRoot = true;
    }
    this.#openNames.push(name);
  }

  /** Closes the open element, which must have the end tag's name. */
  endElement(name: string): void {
    const open = this.#openNames.pop();
    if (open === undefined) this.#fail(ErrorCode.WF_END_TAG_MISMATCH, `An end tag ${name} with no start tag`);
    if (open !== name) this.#fail(ErrorCode.WF_END_TAG_MISMATCH, `An end tag ${name} where element ${open} is open`);
  }

  /** Checks text outside the root, which only whitespace may be. */
  outsideRoot(isWhitespace: boolean): void {
    if (!isWhitespace) this.#fail(ErrorCode.WF_CONTENT_OUTSIDE_ROOT, 'Text outside the root element');
  }

  /** Checks that the document ends with every element closed, having had a root. */
  endDocument(): void {
    if (this.#openNames.length > 0) this.#fail(ErrorCode.WF_UNCLOSED_ELEMENT, 'Elements still open at the end');
    if (!this.#sawRoot) this.#fail(ErrorCode.WF_EMPTY_DOCUMENT, 'No root element');
  }

  /** Throws an XMLError at the location `where` gives. */
  #fail(code: ErrorCode, message: string): never {
    throw ErrorFactory.create(XMLError, code, message, this.#where());
  }
}

/**
 * The index of an attribute in a SAX-style list, by qualified name or by namespace URI and local
 * name; -1 when it has none.
 */
export function attributeIndex(
  attributes: Pick<SAXAttributes, 'length' | 'qName' | 'uri' | 'localName'>,
  qNameOrURI: string,
  localName?: string
): number {
  for (let i = 0; i < attributes.length; i++) {
    const found =
      localName === undefined
        ? attributes.qName(i) === qNameOrURI
        : attributes.localName(i) === localName && attributes.uri(i) === qNameOrURI;
    if (found) return i;
  }
  return -1;
}
