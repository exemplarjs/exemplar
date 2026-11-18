import {
  type AsyncStreamReader,
  ErrorCode,
  EventType,
  InvalidArgumentError,
  type Source,
  type StreamReader as PublicStreamReader,
  XMLError,
  XMLInputFactory,
} from '@exemplarjs/xml';
import type { StreamReaderDelegate } from '@exemplarjs/xml/filters';
import {
  ANCESTOR_XML_ATTRIBUTES,
  byCodeUnit,
  Char,
  CREATE_READER,
  cursorOf,
  declaredPrefixes,
  DTD_COMPLETE,
  ErrorFactory,
  hasScheme,
  isReader,
  isRestrictedChar,
  namespacesInScope,
  ReaderInput,
  type StreamReader,
  XMLNS_NAMESPACE,
} from '@exemplarjs/xml/internal';
import { type CanonicalAttribute, Canonicalizer, type CanonicalXMLMethod } from './render.ts';
import { type CanonicalNode, isNode, TreeCanonicalizer } from './tree.ts';

// Module-level constants, so V8 can inline them; imported bindings are read again on every use.
const {
  START_ELEMENT,
  END_ELEMENT,
  PROCESSING_INSTRUCTION,
  CHARACTERS,
  COMMENT,
  SPACE,
  END_DOCUMENT,
  ENTITY_REFERENCE,
  DTD,
  CDATA,
  NEED_INPUT,
} = EventType;

/** The canonical forms: Canonical XML 1.0 and 1.1, Exclusive Canonicalization, and the XML suite's first and second forms. */
export type CanonicalMethod = 'c14n' | 'c14n11' | 'exc-c14n' | 'suite-first' | 'suite-second';

/** How to canonicalize. */
export interface CanonicalizeOptions {
  /** The form; Canonical XML 1.0 by default. */
  readonly method?: CanonicalMethod;
  /** Keep comments, for the Canonical XML forms. */
  readonly comments?: boolean;
  /** For Exclusive Canonicalization, prefixes treated inclusively; `#default` names the default namespace. */
  readonly inclusivePrefixes?: readonly string[];
  /** A string, the default, or UTF-8 bytes. */
  readonly output?: 'string' | 'bytes';
  /** The factory whose resolvers and access lists read the DTD and external entities. */
  readonly factory?: XMLInputFactory;
}

/** The references the suite's forms write for markup and whitespace characters. */
const SUITE_REFERENCES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};

/** Whether the suite's forms of an XML 1.1 document write a code point as a reference: a RestrictedChar, or NEL. */
function isRestrictedOrNextLine(code: number): boolean {
  return isRestrictedChar(code) || code === Char.NEXT_LINE;
}

/** Orders a start tag's attributes by name. */
function byName([a]: [string, string], [b]: [string, string]): number {
  return byCodeUnit(a, b);
}

/** What canonicalize reads: a source, a cursor or a delegate over one, or a DOM node. */
export type CanonicalInput = Source | PublicStreamReader | StreamReaderDelegate | CanonicalNode;

/**
 * Canonicalizes a document read from a source; a reader from where it stands, the whole document or,
 * at a start tag, that element as a document subset; or a DOM node as a document subset.
 */
export function canonicalize(input: CanonicalInput, options: CanonicalizeOptions & { output: 'bytes' }): Uint8Array;
export function canonicalize(input: CanonicalInput, options?: CanonicalizeOptions): string;
export function canonicalize(input: CanonicalInput, options: CanonicalizeOptions = {}): string | Uint8Array {
  const method = options.method ?? 'c14n';
  let text: string;
  if (isNode(input)) {
    text = treeForm(input, method, options);
  } else {
    const reader = isReader(input) ? (input as StreamReader) : readerFor(input, options, 'sync');
    text = formOf(reader, method, options, 'sync').write();
  }
  return options.output === 'bytes' ? new TextEncoder().encode(text) : text;
}

/**
 * Canonicalizes as `canonicalize` does, reading a stream, or an asynchronous reader, as its input
 * arrives.
 *
 * ```ts
 * const canonical = await canonicalizeAsync(createReadStream('order.xml'));
 * ```
 */
export function canonicalizeAsync(
  input: CanonicalInput | AsyncStreamReader,
  options: CanonicalizeOptions & { output: 'bytes' }
): Promise<Uint8Array>;
export function canonicalizeAsync(
  input: CanonicalInput | AsyncStreamReader,
  options?: CanonicalizeOptions
): Promise<string>;
export async function canonicalizeAsync(
  input: CanonicalInput | AsyncStreamReader,
  options: CanonicalizeOptions = {}
): Promise<string | Uint8Array> {
  const method = options.method ?? 'c14n';
  let text: string;
  if (isNode(input)) {
    text = treeForm(input, method, options);
  } else {
    const reader = isReader(input) ? (input as StreamReader) : readerFor(input, options, 'async');
    // The form needs the document's encoding and version, known once its start is read.
    // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
    for (; reader.eventType() === NEED_INPUT; reader.next()) await reader.fill();
    text = await formOf(reader, method, options, 'async').writeAsync();
  }
  return options.output === 'bytes' ? new TextEncoder().encode(text) : text;
}

/** Whether a method is one of the XML suite's forms. */
function isSuiteForm(method: CanonicalMethod): method is 'suite-first' | 'suite-second' {
  return method === 'suite-first' || method === 'suite-second';
}

/** The canonical form of a DOM node; the suite's forms are of documents read from a source only. */
function treeForm(node: CanonicalNode, method: CanonicalMethod, options: CanonicalizeOptions): string {
  if (isSuiteForm(method))
    throw ErrorFactory.create(
      InvalidArgumentError,
      `${method} is a form of documents read from a source, not of DOM nodes`
    );
  return new TreeCanonicalizer(node, method, options).write(node);
}

/** What writes a method's form of what a reader reads. */
function formOf(
  reader: StreamReader,
  method: CanonicalMethod,
  options: CanonicalizeOptions,
  mode: ReadingMode
): CanonicalXML | SuiteForm {
  return isSuiteForm(method)
    ? new SuiteForm(reader, method === 'suite-second', mode)
    : new CanonicalXML(reader, method, options, mode);
}

/** Whether a form's input is all there, or arrives over time. */
type ReadingMode = 'sync' | 'async';

/** The reader options the Canonical XML forms need of a reader they are given. */
const CANONICAL_NEEDS = { namespaceAware: true, replaceEntityReferences: true };

/** The cursor options canonicalization reads with. */
const READER_OVERRIDES = {
  namespaceAware: true,
  namespacePrefixes: false,
  replaceEntityReferences: true,
  supportExternalEntities: true,
  coalescing: false,
  reportEntityBoundaries: false,
};

/** The cursor options the suite's forms read with, which report namespace declarations as attributes. */
const SUITE_READER_OVERRIDES = { ...READER_OVERRIDES, namespacePrefixes: true };

/** A cursor that expands entities and applies defaults; the suite's forms also report namespace declarations as attributes. */
function readerFor(source: Source, options: CanonicalizeOptions, mode: ReadingMode): StreamReader {
  const overrides = isSuiteForm(options.method ?? 'c14n') ? SUITE_READER_OVERRIDES : READER_OVERRIDES;
  return (options.factory ?? new XMLInputFactory())[CREATE_READER](source, overrides, mode === 'async');
}

/** Fails canonicalization at the cursor's location. */
function fail(reader: StreamReader, code: ErrorCode, message: string): never {
  throw ErrorFactory.create(XMLError, code, message, reader.location());
}

/**
 * Canonical XML 1.0 and 1.1, and Exclusive Canonicalization, of what a cursor reads from where it
 * stands: a whole document, or one element as a document subset. The element is then the apex,
 * which declares every namespace in scope and, for the inclusive forms, takes on its ancestors'
 * `xml:` attributes, as a DOM element canonicalized on its own does.
 */
class CanonicalXML extends Canonicalizer {
  readonly #input: ReaderInput;
  readonly #reader: StreamReader;
  /** The namespaces in scope, per open element, innermost last; first, those around the apex. */
  readonly #namespacesInScope: ReadonlyMap<string, string>[] = [new Map([['', '']])];
  /** The namespaces declared in the output, per open element, innermost last. */
  readonly #namespacesRendered: ReadonlyMap<string, string>[] = [new Map([['', '']])];
  #sawRoot = false;

  constructor(reader: StreamReader, method: CanonicalXMLMethod, options: CanonicalizeOptions, mode: ReadingMode) {
    super(method, options, reader.declaredEncoding() ?? reader.encoding());
    this.#input = new ReaderInput(reader, { consumer: 'canonicalize', mode, needs: CANONICAL_NEEDS });
    this.#reader = reader;
  }

  /** Reads the document, or the element, to its end and returns its canonical form. */
  write(): string {
    const input = this.#input;
    for (let event = this.#first(); event !== END_DOCUMENT; event = input.next()) this.#writeEvent(event);
    return this.output;
  }

  /** As `write`, waiting for input as it is needed. */
  async writeAsync(): Promise<string> {
    const input = this.#input;
    for (let event = this.#first(); event !== END_DOCUMENT; event = input.next()) {
      // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
      if (event === NEED_INPUT) await this.#reader.fill();
      else this.#writeEvent(event);
    }
    return this.output;
  }

  /** The first event, with the namespaces an element read on its own sits in; XML 1.1 has no canonical form. */
  #first(): EventType {
    const reader = this.#reader;
    if (reader.version() === '1.1') fail(reader, ErrorCode.C14N_VERSION, 'Canonical XML is not defined for XML 1.1');
    const event = this.#input.first();
    this.#namespacesInScope[0] = new Map([['', ''], ...this.#input.inherited]);
    return event;
  }

  /** Writes one event's canonical form, and refuses what cannot be canonicalized. */
  #writeEvent(event: EventType): void {
    const reader = this.#reader;
    switch (event) {
      case START_ELEMENT: {
        this.#startElement();
        break;
      }
      case END_ELEMENT: {
        this.#endElement();
        break;
      }
      case CHARACTERS:
      case CDATA:
      case SPACE: {
        // Only inside the root: the input passes over whitespace outside it.
        this.writeCharacters(reader.text());
        break;
      }
      case COMMENT: {
        if (this.keepsComments) this.#writeCommentOrPI(this.commentMarkup(reader.text()));
        break;
      }
      case PROCESSING_INSTRUCTION: {
        this.#writeCommentOrPI(this.piMarkup(reader.piTarget(), reader.piData()));
        break;
      }
      case DTD: {
        if (!cursorOf(reader)[DTD_COMPLETE]) fail(reader, ErrorCode.C14N_UNREAD, 'Part of the DTD could not be read');
        break;
      }
      case ENTITY_REFERENCE: {
        fail(reader, ErrorCode.C14N_UNREAD, `The entity ${reader.name()} could not be read`);
        break;
      }
      default:
    }
  }

  /** Writes a comment or PI; outside the root element it gets a line of its own. */
  #writeCommentOrPI(markup: string): void {
    if (this.#input.depth > 0) this.output += markup;
    else if (this.#sawRoot) this.output += `\n${markup}`;
    else this.output += `${markup}\n`;
  }

  /** Writes a start tag and opens its element's namespace scope; the apex renders every namespace in scope. */
  #startElement(): void {
    const reader = this.#reader;
    this.#sawRoot = true;
    const isApex = this.#input.depth === 1;
    const scope = this.#startTagScope(isApex);
    this.#namespacesInScope.push(scope);
    const ancestors = isApex ? cursorOf(reader)[ANCESTOR_XML_ATTRIBUTES]() : undefined;
    const attributes = this.sortedAttributes(this.#attributes(), ancestors);
    const candidates = this.candidatePrefixes(isApex, scope, reader.prefix(), attributes, () =>
      declaredPrefixes(reader)
    );
    const parentRendered = this.#namespacesRendered.at(-1) as ReadonlyMap<string, string>;
    this.#namespacesRendered.push(this.writeStartTag(reader.name(), candidates, scope, parentRendered, attributes));
  }

  /** Writes an end tag and closes its element's namespace scope. */
  #endElement(): void {
    this.output += `</${this.#reader.name()}>`;
    this.#namespacesInScope.pop();
    this.#namespacesRendered.pop();
  }

  /** The namespaces in scope on the start tag: the parent's, with the tag's declarations; the apex's must all be absolute. */
  #startTagScope(isApex: boolean): ReadonlyMap<string, string> {
    const reader = this.#reader;
    const parentScope = this.#namespacesInScope.at(-1) as ReadonlyMap<string, string>;
    if (isApex) for (const uri of parentScope.values()) this.#requireAbsolute(uri);
    for (let i = 0; i < reader.namespaceCount(); i++) this.#requireAbsolute(reader.namespaceURI(i));
    return namespacesInScope(parentScope, reader);
  }

  /** Refuses a relative namespace URI, as canonicalization must. */
  #requireAbsolute(uri: string): void {
    if (uri !== '' && !hasScheme(uri)) {
      fail(this.#reader, ErrorCode.C14N_RELATIVE_NAMESPACE, `The namespace URI ${uri} is relative`);
    }
  }

  /** The start tag's attributes, without namespace declarations. */
  #attributes(): CanonicalAttribute[] {
    const reader = this.#reader;
    const attributes: CanonicalAttribute[] = [];
    for (let i = 0; i < reader.attributeCount(); i++) {
      const uri = reader.attributeNamespace(i);
      if (uri !== XMLNS_NAMESPACE)
        attributes.push([uri, reader.attributeLocalName(i), reader.attributeName(i), reader.attributeValue(i)]);
    }
    return attributes;
  }
}

/**
 * The canonical forms the XML conformance suite compares parsers' output with, and their XML 1.1
 * variants. The first form is the document's content: elements with sorted attributes, text with
 * markup characters and whitespace written as references, and processing instructions. The second
 * form adds a DOCTYPE listing the notations, for tests that report them.
 */
class SuiteForm {
  readonly #reader: StreamReader;
  readonly #input: ReaderInput;
  readonly #isSecondForm: boolean;
  readonly #version11: boolean;
  /** The DTD's notations, written in the second form's DOCTYPE. */
  readonly #notations = new Map<string, { publicId: string | undefined; systemId: string | undefined }>();
  /** The form written so far; from the root element on, only what follows the DOCTYPE. */
  #output = '';
  /** What was written before the root element, where the DOCTYPE goes; undefined until the root starts. */
  #outputBeforeRoot: string | undefined;
  #rootName = '';

  constructor(reader: StreamReader, isSecondForm: boolean, mode: ReadingMode) {
    this.#reader = reader;
    this.#input = new ReaderInput(reader, { consumer: 'canonicalize', mode });
    this.#isSecondForm = isSecondForm;
    this.#version11 = reader.version() === '1.1';
  }

  /** Reads the document to its end and returns its form; the forms are of whole documents only. */
  write(): string {
    const input = this.#input;
    for (let event = this.#first(); event !== END_DOCUMENT; event = input.next()) this.#writeEvent(event);
    return this.#form();
  }

  /** As `write`, waiting for input as it is needed. */
  async writeAsync(): Promise<string> {
    const input = this.#input;
    for (let event = this.#first(); event !== END_DOCUMENT; event = input.next()) {
      // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
      if (event === NEED_INPUT) await this.#reader.fill();
      else this.#writeEvent(event);
    }
    return this.#form();
  }

  /** The first event; the forms are of whole documents only. */
  #first(): EventType {
    const event = this.#input.first();
    if (this.#input.isElement)
      throw ErrorFactory.create(InvalidArgumentError, 'The suite forms are of whole documents, not of elements');
    return event;
  }

  /** The form, once the document is read. */
  #form(): string {
    const declaration = this.#version11 ? '<?xml version="1.1"?>' : '';
    // The input has checked that the document has a root, which set what goes before it.
    return declaration + (this.#outputBeforeRoot as string) + this.#notationDoctype() + this.#output;
  }

  /** Writes one event's form; the DTD's processing instructions are written, and its notations kept for the DOCTYPE. */
  #writeEvent(event: EventType): void {
    const reader = this.#reader;
    switch (event) {
      case START_ELEMENT: {
        this.#startElement();
        break;
      }
      case END_ELEMENT: {
        this.#output += `</${reader.name()}>`;
        break;
      }
      case CHARACTERS:
      case CDATA:
      case SPACE: {
        // Only inside the root: the input passes over whitespace outside it.
        this.#output += this.#escape(reader.text());
        break;
      }
      case PROCESSING_INSTRUCTION: {
        this.#output += `<?${reader.piTarget()} ${reader.piData()}?>`;
        break;
      }
      case DTD: {
        const doctype = reader.doctype();
        for (const { target, data } of doctype.processingInstructions) this.#output += `<?${target} ${data}?>`;
        for (const { name, publicId, systemId } of doctype.notations) this.#notations.set(name, { publicId, systemId });
        break;
      }
      default:
    }
  }

  /** Writes a start tag with its attributes sorted by name; the first one sets what goes before the root. */
  #startElement(): void {
    const reader = this.#reader;
    if (this.#outputBeforeRoot === undefined) {
      this.#outputBeforeRoot = this.#output;
      this.#output = '';
      this.#rootName = reader.name();
    }
    const attributes: [string, string][] = [];
    for (let i = 0; i < reader.attributeCount(); i++)
      attributes.push([reader.attributeName(i), reader.attributeValue(i)]);
    attributes.sort(byName);
    let tag = `<${reader.name()}`;
    for (const [name, value] of attributes) tag += ` ${name}="${this.#escape(value)}"`;
    this.#output += `${tag}>`;
  }

  /** Text with markup characters and whitespace, and in XML 1.1 control characters, written as references. */
  #escape(text: string): string {
    let escaped = '';
    for (const char of text) {
      const code = char.codePointAt(0) as number;
      const reference = SUITE_REFERENCES[char];
      if (reference !== undefined) escaped += reference;
      else if (this.#version11 && isRestrictedOrNextLine(code)) escaped += `&#${code};`;
      else escaped += char;
    }
    return escaped;
  }

  /** The second form's DOCTYPE, listing the notations sorted by name; empty in the first form or without notations. */
  #notationDoctype(): string {
    if (!this.#isSecondForm || this.#notations.size === 0) return '';
    let doctype = `<!DOCTYPE ${this.#rootName} [\n`;
    for (const [name, { publicId, systemId }] of [...this.#notations].toSorted(([a], [b]) => byCodeUnit(a, b))) {
      if (publicId === undefined) doctype += `<!NOTATION ${name} SYSTEM '${systemId as string}'>\n`;
      else if (systemId === undefined) doctype += `<!NOTATION ${name} PUBLIC '${publicId}'>\n`;
      else doctype += `<!NOTATION ${name} PUBLIC '${publicId}' '${systemId}'>\n`;
    }
    return `${doctype}]>\n`;
  }
}
