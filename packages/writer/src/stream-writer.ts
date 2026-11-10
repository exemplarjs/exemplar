import { ErrorCode, type QName } from '@exemplarjs/xml';
import {
  canonicalEncoding,
  declarationName,
  ErrorFactory,
  isAllWhitespace,
  isXmlName,
  reservedBindingProblem,
  XMLNS_NAMESPACE,
} from '@exemplarjs/xml/internal';
import { ContextNode } from './context-node.ts';
import { ElementLists } from './element-lists.ts';
import type { Encoder } from './encoders.ts';
import { WriterError } from './error.ts';
import {
  CDATA_BRACKETS_LENGTH,
  cdataSections,
  cdataSectionsAround,
  checkLiteral,
  type Escaper,
  escaper,
  quotedLiteral,
} from './escape.ts';
import { isKnownNcName, qualifiedName } from './names.ts';
import { NamespaceBindings } from './namespaces.ts';
import { type WritableNode, writeNode } from './node.ts';
import type { ResolvedOutputOptions } from './options.ts';
import { Output } from './output.ts';
import { type CopiedReader, copyReader, copyReaderAsync } from './reader-copy.ts';
import type { ByteSink, Sink } from './sinks.ts';

/** Where the writer is in the document. */
const State = { PROLOG: 0, ROOT: 1, EPILOG: 2 } as const;

/** Whether a start tag opens an element with content to follow, or one that ends with the tag. */
type ElementKind = 'with content' | 'empty';

/** The entities every document declares (§4.6). */
const PREDEFINED_ENTITY_NAMES = new Set(['amp', 'lt', 'gt', 'apos', 'quot']);

/**
 * A writer of XML, following StAX's `XMLStreamWriter`: each call writes the next piece of the
 * document, and the writer keeps track of the open elements, so `writeEndElement()` needs no name.
 *
 * ```ts
 * const sink = new StringSink();
 * const writer = new XMLOutputFactory().createStreamWriter(sink);
 * writer.writeStartDocument();
 * writer.writeStartElement('greeting');
 * writer.writeAttribute('lang', 'en');
 * writer.writeCharacters('Hello & welcome');
 * writer.writeEndDocument();
 * // sink.toString(): <?xml version="1.0" encoding="UTF-8"?>
 * // <greeting lang="en">Hello &amp; welcome</greeting>
 * ```
 *
 * A start tag stays open after `writeStartElement` so that attributes and namespace declarations
 * can follow; the next content closes it. Unless `checkWellFormedness` is off, a write that would not
 * give well-formed XML throws a `WriterError`. With `repairNamespaces` on, the writer declares the
 * namespaces that names use and the output lacks.
 */
export class StreamWriter {
  readonly #output: Output;
  readonly #options: ResolvedOutputOptions;
  readonly #encoder: Encoder;
  readonly #checksWellFormedness: boolean;
  readonly #namespaceAware: boolean;
  /** Repairing mode, which only a namespace-aware writer has. */
  readonly #isRepairing: boolean;
  /** Whether closing a start tag checks its prefixes are bound: checking, namespace-aware and not repairing. */
  readonly #checksBindings: boolean;
  readonly #escapesMinimally: boolean;
  /** With minimal escaping, the end of the text last written and where it ended, to catch `]]>` split across writes. */
  #textTail = '';
  #textTailEnd = -1;
  /** Escapes for the document's XML version, which `writeStartDocument` can change. */
  #escaper: Escaper;
  #state: number = State.PROLOG;
  /** Whether anything has been written, which indentation needs before a top-level node. */
  #hasWritten = false;
  #wroteDoctype = false;
  /** Whether a start tag is open for attributes, and whether it came from `writeEmptyElement`. */
  #isTagOpen = false;
  #isEmptyElement = false;
  /** The CDATA and suppress-indentation lists, and which open elements write CDATA. */
  readonly #elementLists: ElementLists;

  // The open elements: qualified names, and whether each holds element children.
  readonly #openNames: string[] = [];
  readonly #hasElementChildren: boolean[] = [];
  /** Depth of the outermost open element holding text (0: text outside all, -1: none); nothing inside it is indented. */
  #textDepth = -1;

  /** The namespace bindings in scope, and the element whose start tag is being written. */
  readonly #bindings = new NamespaceBindings();
  readonly #contextNode = new ContextNode();

  constructor(sink: Sink | ByteSink, options: ResolvedOutputOptions, encoder: Encoder) {
    this.#output = new Output(sink, encoder);
    this.#options = options;
    this.#encoder = encoder;
    this.#checksWellFormedness = options.checkWellFormedness;
    this.#namespaceAware = options.namespaceAware;
    this.#isRepairing = options.repairNamespaces && this.#namespaceAware;
    this.#checksBindings = this.#checksWellFormedness && this.#namespaceAware && !this.#isRepairing;
    this.#escapesMinimally = options.escaping === 'minimal';
    this.#escaper = this.#escaperFor(options.version);
    this.#elementLists = new ElementLists(options.cdataSectionElements, options.suppressIndentation);
  }

  /** The escaper for an XML version. */
  #escaperFor(version: string): Escaper {
    return escaper({
      minimal: this.#escapesMinimally,
      version11: version === '1.1',
      unencodable: this.#encoder.unencodable,
      checkCharacters: this.#checksWellFormedness,
      characterMap: this.#options.characterMap,
    });
  }

  /** Throws a `WriterError`. */
  #fail(code: ErrorCode, message: string): never {
    throw ErrorFactory.create(WriterError, code, message);
  }

  // The document

  /** Writes the XML declaration on a line of its own, unless the factory omits it; a byte sink must be in the encoding it declares. */
  writeStartDocument(
    version: string = this.#options.version,
    encoding: string = this.#encoder.name,
    standalone?: boolean
  ): void {
    this.#beforeChild();
    if (this.#checksWellFormedness && (this.#hasWritten || this.#state !== State.PROLOG)) {
      this.#fail(ErrorCode.WRITE_STATE, 'The XML declaration must come first');
    }
    if (!/^1\.\d+$/.test(version)) this.#fail(ErrorCode.WRITE_STATE, `XML ${version} is not a version`);
    this.#escaper = this.#escaperFor(version);
    if (this.#options.omitXMLDeclaration) return;
    if (this.#output.isEncoded && canonicalEncoding(encoding) !== canonicalEncoding(this.#encoder.name)) {
      this.#fail(ErrorCode.WRITE_ENCODING, `The output is in ${this.#encoder.name}, so it cannot declare ${encoding}`);
    }
    const yesOrNo = standalone ? 'yes' : 'no';
    const declared = standalone === undefined ? '' : ` standalone="${yesOrNo}"`;
    this.#writeMarkup(`<?xml version="${version}" encoding="${encoding}"${declared}?>`);
  }

  /** Closes every open element and hands the output to the sink. */
  writeEndDocument(): void {
    if (this.#isTagOpen && this.#isEmptyElement) this.#beforeContent();
    while (this.#openNames.length > 0) this.writeEndElement();
    if (this.#checksWellFormedness && this.#state === State.PROLOG)
      this.#fail(ErrorCode.WRITE_STATE, 'A document needs a root element');
    this.#output.flush();
  }

  /** Writes a DOCTYPE as given, such as an event reader's DTD event text. */
  writeDTD(dtd: string): void {
    this.#beforeChild();
    if (this.#checksWellFormedness && (this.#state !== State.PROLOG || this.#wroteDoctype)) {
      this.#fail(ErrorCode.WRITE_STATE, 'The DOCTYPE must come once, before the root element');
    }
    this.#checkEncodable(dtd, 'the DOCTYPE');
    this.#wroteDoctype = true;
    this.#writeMarkup(dtd);
  }

  // Elements

  /** Starts an element: by QName, by local name, by namespace URI and local name, or by prefix, local name and URI. */
  writeStartElement(name: QName): void;
  writeStartElement(localName: string): void;
  writeStartElement(namespaceURI: string, localName: string): void;
  writeStartElement(prefix: string, localName: string, namespaceURI: string): void;
  writeStartElement(first: string | QName, second?: string, third?: string): void {
    this.#startElement(first, second, third, 'with content');
  }

  /** Writes an empty element, which takes attributes and namespaces until the next write. */
  writeEmptyElement(name: QName): void;
  writeEmptyElement(localName: string): void;
  writeEmptyElement(namespaceURI: string, localName: string): void;
  writeEmptyElement(prefix: string, localName: string, namespaceURI: string): void;
  writeEmptyElement(first: string | QName, second?: string, third?: string): void {
    this.#startElement(first, second, third, 'empty');
  }

  /** Starts an element from the arguments of one of the overloads; a local name alone names no namespace. */
  #startElement(first: string | QName, second: string | undefined, third: string | undefined, kind: ElementKind): void {
    this.#beforeChild();
    if (this.#checksWellFormedness && this.#state === State.EPILOG) {
      this.#fail(ErrorCode.WRITE_STATE, 'A document has only one root element');
    }
    if (typeof first !== 'string') {
      this.#openElement(first.prefix, first.localName, first.namespaceURI, kind); // (name)
    } else if (second === undefined) {
      this.#openElement('', first, undefined, kind); // (localName)
    } else if (!this.#namespaceAware) {
      // Without namespaces, only the three-argument form gives a prefix, kept in the name.
      const prefix = third === undefined ? '' : first;
      this.#openElement('', qualifiedName(prefix, second), undefined, kind); // either namespaced form
    } else if (third === undefined) {
      this.#openElement(this.#prefixFor(first, 'element'), second, first, kind); // (namespaceURI, localName)
    } else {
      this.#openElement(first, second, third, kind); // (prefix, localName, namespaceURI)
    }
  }

  /** Writes a start tag and opens its element; with no URI, the element takes the default namespace its tag ends with. */
  #openElement(prefix: string, localName: string, uri: string | undefined, kind: ElementKind): void {
    if (this.#checksWellFormedness) this.#checkName(prefix, localName, uri);
    const name = qualifiedName(prefix, localName);
    this.#checkEncodable(name, 'an element name');
    if (this.#state === State.PROLOG) this.#writeOptionsDoctype(name);
    this.#state = State.ROOT;
    this.#indent(this.#openNames.length);
    this.#output.write(`<${name}`);
    this.#hasWritten = true;
    this.#openNames.push(name);
    this.#hasElementChildren.push(false);
    this.#bindings.enter();
    this.#isTagOpen = true;
    this.#isEmptyElement = kind === 'empty';
    this.#contextNode.open(prefix, uri);
    this.#elementLists.open(prefix, localName, uri);
    if (this.#isRepairing && uri !== undefined) this.#repair(prefix, uri);
  }

  /**
   * Ends the innermost open element. Given the qualified name an end tag has, as a SAX event or an
   * event object gives one, it checks that the open element has that name, unless namespaces are
   * repaired, which can change the prefix written.
   */
  writeEndElement(endTagName?: string): void {
    if (this.#isTagOpen && this.#isEmptyElement) this.#beforeContent();
    const depth = this.#openNames.length;
    if (depth === 0) this.#fail(ErrorCode.WRITE_STATE, 'No element is open');
    const name = this.#openNames[depth - 1] as string;
    if (endTagName !== undefined && endTagName !== name && this.#checksWellFormedness && !this.#isRepairing)
      this.#fail(ErrorCode.WRITE_STATE, `The end tag ${endTagName} does not match the open element ${name}`);
    if (this.#isTagOpen) {
      this.#closeTag('ends element');
    } else {
      if (this.#hasElementChildren[depth - 1] === true) this.#indent(depth - 1);
      this.#output.write(`</${name}>`);
    }
    this.#popElement();
  }

  /** Forgets the innermost element once its end tag is written. */
  #popElement(): void {
    this.#openNames.pop();
    this.#hasElementChildren.pop();
    this.#elementLists.close();
    this.#bindings.leave();
    const depth = this.#openNames.length;
    if (this.#textDepth > depth) this.#textDepth = -1;
    if (depth === 0) this.#state = State.EPILOG;
  }

  // Attributes and namespaces

  /** Writes an attribute of the open start tag: by QName, local name, URI and local name, or prefix, local name and URI. */
  writeAttribute(name: QName, value: string): void;
  writeAttribute(localName: string, value: string): void;
  writeAttribute(namespaceURI: string, localName: string, value: string): void;
  writeAttribute(prefix: string, localName: string, namespaceURI: string, value: string): void;
  writeAttribute(first: string | QName, second: string, third?: string, fourth?: string): void {
    if (typeof first !== 'string') this.#attribute(first.prefix, first.namespaceURI, first.localName, second);
    else if (third === undefined) this.#attribute('', '', first, second);
    else if (fourth === undefined) this.#attribute('', first, second, third);
    else this.#attribute(first, third, second, fourth);
  }

  /** Writes an attribute, finding a prefix for its URI when none is given; one naming a declaration declares it. */
  #attribute(givenPrefix: string, uri: string, localName: string, value: string): void {
    this.#requireOpenTag('Attributes');
    if (!this.#namespaceAware) {
      this.#namedAttribute(qualifiedName(givenPrefix, localName), value);
      return;
    }
    if (
      (localName === 'xmlns' || givenPrefix === 'xmlns' || uri === XMLNS_NAMESPACE) &&
      this.#writeAsDeclaration(givenPrefix, uri, localName, value)
    ) {
      return;
    }
    const prefix = givenPrefix === '' ? this.#prefixFor(uri, 'attribute') : givenPrefix;
    if (this.#checksWellFormedness) {
      this.#checkName(prefix, localName, uri);
      this.#checkDuplicate(uri, localName);
    }
    if (this.#isRepairing && uri !== '') this.#repair(prefix, uri);
    else if (prefix !== '') this.#contextNode.notePrefixedAttribute(prefix, uri);
    this.#writeAttributeText(qualifiedName(prefix, localName), value);
  }

  /** Writes an attribute into the open start tag, its value escaped. */
  #writeAttributeText(name: string, value: string): void {
    this.#checkEncodable(name, 'an attribute name');
    this.#output.write(` ${name}="${this.#escaper.attribute(value)}"`);
  }

  /** Writes an attribute that names a namespace declaration as the declaration; false when it is an ordinary attribute (Namespaces §3). */
  #writeAsDeclaration(prefix: string, uri: string, localName: string, value: string): boolean {
    const inXmlns = uri === XMLNS_NAMESPACE;
    if (localName === 'xmlns' && prefix === '' && (uri === '' || inXmlns)) {
      this.#declarePrefix('', value);
      return true;
    }
    // The xmlns prefix with its namespace or none, or that namespace with no prefix.
    const xmlnsName = (prefix === 'xmlns' && (uri === '' || inXmlns)) || (prefix === '' && inXmlns);
    if (localName !== 'xmlns' && xmlnsName) {
      this.#declarePrefix(localName, value);
      return true;
    }
    if (prefix !== 'xmlns' && !inXmlns) return false;
    if (this.#checksWellFormedness)
      this.#fail(ErrorCode.WRITE_NAME, 'The xmlns prefix and namespace only declare other prefixes');
    return false;
  }

  /** Writes an attribute by its name as given, for a writer that is not namespace-aware. */
  #namedAttribute(name: string, value: string): void {
    if (this.#checksWellFormedness) {
      this.#checkName('', name, undefined);
      this.#checkDuplicate('', name);
    }
    this.#writeAttributeText(name, value);
  }

  /** Throws unless a start tag is open for attributes and declarations. */
  #requireOpenTag(what: string): void {
    if (!this.#isTagOpen) this.#fail(ErrorCode.WRITE_STATE, `${what} go directly after a start tag`);
  }

  /** Whether a name is an XML name without colons, or with them when the writer is not namespace-aware (Namespaces §7). */
  #isName(name: string): boolean {
    return isKnownNcName(name) || (!this.#namespaceAware && isXmlName(name));
  }

  /** Throws unless a name's parts are names and it gives the reserved prefixes and namespaces only to each other (Namespaces §3). */
  #checkName(prefix: string, localName: string, uri: string | undefined): void {
    if (!this.#isName(localName)) {
      this.#fail(ErrorCode.WRITE_NAME, `${localName} is not a ${this.#namespaceAware ? 'local name' : 'name'}`);
    }
    if (prefix !== '' && !isKnownNcName(prefix)) this.#fail(ErrorCode.WRITE_NAME, `${prefix} is not a prefix`);
    this.#checkBinding(prefix, uri);
  }

  /** Throws when a name or declaration binds a reserved prefix or namespace as Namespaces §3 forbids. */
  #checkBinding(prefix: string, uri: string | undefined): void {
    const problem = reservedBindingProblem(prefix, uri);
    if (problem !== undefined) this.#fail(ErrorCode.WRITE_NAME, problem);
  }

  /** Throws when the output encoding cannot hold markup that cannot be written as references, such as a name. */
  #checkEncodable(text: string, what: string): void {
    if (this.#encoder.unencodable?.test(text) === true) checkLiteral(text, this.#escaper.options, what);
  }

  /** Throws when the open start tag already has an attribute of this expanded name. */
  #checkDuplicate(uri: string, localName: string): void {
    if (this.#contextNode.repeatsAttribute(uri, localName)) {
      this.#fail(ErrorCode.WRITE_DUPLICATE_ATTRIBUTE, `The attribute ${localName} is written twice`);
    }
  }

  /** Declares a namespace on the open start tag; the empty prefix declares the default namespace. */
  writeNamespace(prefix: string, namespaceURI: string): void {
    this.#declarePrefix(prefix === 'xmlns' ? '' : prefix, namespaceURI);
  }

  /** Declares the default namespace on the open start tag. */
  writeDefaultNamespace(namespaceURI: string): void {
    this.#declarePrefix('', namespaceURI);
  }

  /** Declares a prefix, or the default namespace, on the open start tag; a writer that is not namespace-aware writes it as an attribute. */
  #declarePrefix(prefix: string, uri: string): void {
    this.#requireOpenTag('Namespace declarations');
    if (!this.#namespaceAware) {
      this.#namedAttribute(declarationName(prefix), uri);
      return;
    }
    if (this.#checksWellFormedness) this.#checkDeclaration(prefix, uri);
    this.#declareOnTag(prefix, uri);
  }

  /** Throws unless a prefix may be declared for a URI: it is a prefix, binds nothing reserved, and is undeclared only in XML 1.1. */
  #checkDeclaration(prefix: string, uri: string): void {
    if (prefix !== '' && !isKnownNcName(prefix)) this.#fail(ErrorCode.WRITE_NAME, `${prefix} is not a prefix`);
    this.#checkBinding(prefix, uri);
    if (prefix !== '' && uri === '' && !this.#escaper.options.version11) {
      this.#fail(ErrorCode.WRITE_NAME, 'A prefix can be undeclared only in XML 1.1');
    }
  }

  /** Writes a declaration on the open start tag and binds it, unless the tag already declares that prefix. */
  #declareOnTag(prefix: string, uri: string): void {
    const declared = this.#bindings.declaredOnTag(prefix);
    if (declared !== undefined) {
      if (declared === uri) return;
      this.#fail(ErrorCode.WRITE_DUPLICATE_ATTRIBUTE, `The prefix ${prefix} is declared twice on one element`);
    }
    if (prefix !== 'xml') this.#bindings.declare(prefix, uri);
    this.#writeAttributeText(declarationName(prefix), uri);
  }

  /** The prefix to write for a URI: one already bound to it, or in repairing mode one to declare. */
  #prefixFor(uri: string, nameOf: 'element' | 'attribute'): string {
    if (uri === '') return '';
    const isElement = nameOf === 'element';
    if (isElement && (this.#bindings.uriOf('') ?? '') === uri) return '';
    const found = this.#bindings.prefixOf(uri);
    if (found !== undefined && (found !== '' || isElement)) return found;
    if (this.#isRepairing) return isElement ? '' : this.#bindings.newPrefix();
    return this.#fail(ErrorCode.WRITE_UNBOUND_PREFIX, `No prefix is bound to ${uri}`);
  }

  /** In repairing mode, declares a binding the element or an attribute needs and the output lacks. */
  #repair(prefix: string, uri: string): void {
    if (this.#bindings.declaredURIOf(prefix) === uri) return;
    if (this.#bindings.declaredOnTag(prefix) !== undefined)
      this.#fail(ErrorCode.WRITE_UNBOUND_PREFIX, `The prefix ${prefix} is already bound on this element`);
    this.#declareOnTag(prefix, uri);
  }

  /** Binds a prefix for later lookups without declaring it, as StAX's `setPrefix` does. */
  setPrefix(prefix: string, namespaceURI: string): void {
    this.#bindings.setForLookups(prefix, namespaceURI);
  }

  /** Binds the default namespace for later lookups without declaring it. */
  setDefaultNamespace(namespaceURI: string): void {
    this.#bindings.setForLookups('', namespaceURI);
  }

  /** The prefix bound to a URI, declared or set, or undefined. */
  prefixOf(namespaceURI: string): string | undefined {
    return this.#bindings.prefixOf(namespaceURI);
  }

  /** The URI a prefix is bound to, declared or set, or undefined. */
  namespaceOf(prefix: string): string | undefined {
    return this.#bindings.uriOf(prefix);
  }

  /** Closes the open start tag: checks its prefixes, writes `>` or `/>`, then matches it against the element lists. */
  #closeTag(next: 'ends element' | 'content follows'): void {
    this.#isTagOpen = false;
    // Each prefix the start tag uses must be bound to its URI.
    const problem = this.#checksBindings ? this.#contextNode.unboundPrefixProblem(this.#bindings) : undefined;
    if (problem !== undefined) this.#fail(ErrorCode.WRITE_UNBOUND_PREFIX, problem);
    const endsHere = next === 'ends element' || this.#isEmptyElement;
    this.#output.write(endsHere ? '/>' : '>');
    const lists = this.#elementLists;
    if (lists.isEmpty) return;
    const depth = this.#openNames.length;
    const name = this.#openNames[depth - 1] as string;
    lists.noteCData(name, this.#bindings);
    if (lists.suppressesIndentation(name, this.#bindings)) this.#noteText(depth);
  }

  /** Finishes an open start tag before content, and ends an empty element, before something is written inside it. */
  #beforeContent(): void {
    if (!this.#isTagOpen) return;
    const isEmptyElement = this.#isEmptyElement;
    this.#closeTag('content follows');
    if (isEmptyElement) this.#popElement();
  }

  /** Prepares for a child node: closes the open tag, and notes the parent has children. */
  #beforeChild(): void {
    this.#beforeContent();
    const depth = this.#openNames.length;
    if (depth > 0) this.#hasElementChildren[depth - 1] = true;
  }

  /** Notes text at a depth, after which nothing is indented until the element holding it ends. */
  #noteText(depth: number): void {
    if (this.#textDepth < 0) this.#textDepth = depth;
  }

  /** Writes a line break and the indentation for a depth, unless it would be next to text. */
  #indent(depth: number): void {
    const indent = this.#options.indent;
    if (indent === undefined || this.#textDepth >= 0) return;
    if (depth > 0) this.#output.write(`\n${indent.repeat(depth)}`);
    else if (this.#hasWritten) this.#output.write('\n');
  }

  /** Writes the DOCTYPE the factory's options ask for, before the root element. */
  #writeOptionsDoctype(root: string): void {
    const { doctypePublic, doctypeSystem } = this.#options;
    if (this.#wroteDoctype || doctypeSystem === undefined) return;
    const system = quotedLiteral(doctypeSystem);
    const id = doctypePublic === undefined ? `SYSTEM ${system}` : `PUBLIC ${quotedLiteral(doctypePublic)} ${system}`;
    this.writeDTD(`<!DOCTYPE ${root} ${id}>`);
  }

  // Content

  /** Writes character data, escaped; outside the root element only whitespace may be written. */
  writeCharacters(text: string): void {
    this.#beforeContent();
    const depth = this.#openNames.length;
    if (depth === 0) {
      this.#writeOutsideRoot(text);
      return;
    }
    if (text === '') return;
    this.#noteText(depth);
    if (this.#elementLists.writesCData) this.#cdataSection(text, 'split ]]>');
    else if (this.#escapesMinimally) this.#writeTextMinimally(text);
    else this.#output.write(this.#escaper.text(text));
  }

  /** Writes text with minimal escaping, escaping a `>` that ends a `]]` the text written just before ends with. */
  #writeTextMinimally(text: string): void {
    const output = this.#output;
    const before = output.writtenLength === this.#textTailEnd ? this.#textTail : '';
    const close = (before + text.slice(0, CDATA_BRACKETS_LENGTH)).indexOf(']]>');
    if (close === -1 || close >= before.length) {
      output.write(this.#escaper.text(text));
    } else {
      const greaterThan = close + CDATA_BRACKETS_LENGTH - before.length;
      const escape = this.#escaper;
      output.write(`${escape.text(text.slice(0, greaterThan))}&gt;${escape.text(text.slice(greaterThan + 1))}`);
    }
    this.#textTail = (before + text).slice(-CDATA_BRACKETS_LENGTH);
    this.#textTailEnd = output.writtenLength;
  }

  /** Writes text outside the root element: whitespace as it is, unless indenting, and other text, unchecked, escaped. */
  #writeOutsideRoot(text: string): void {
    if (isAllWhitespace(text)) {
      if (this.#options.indent !== undefined || text === '') return;
      this.#output.write(text);
      this.#hasWritten = true;
      return;
    }
    if (this.#checksWellFormedness)
      this.#fail(ErrorCode.WRITE_STATE, 'Only whitespace may be written outside the root element');
    this.#noteText(0);
    this.#output.write(this.#escaper.text(text));
    this.#hasWritten = true;
  }

  /** Writes a CDATA section. */
  writeCData(text: string): void {
    this.#beforeContent();
    const depth = this.#openNames.length;
    if (this.#checksWellFormedness && depth === 0)
      this.#fail(ErrorCode.WRITE_STATE, 'CDATA sections go inside the root element');
    this.#noteText(depth);
    this.#cdataSection(text, this.#checksWellFormedness ? 'refuse ]]>' : 'split ]]>');
  }

  /** Writes text as CDATA, splitting it around `]]>` unless that is an error, and around characters the encoding lacks. */
  #cdataSection(text: string, terminator: 'refuse ]]>' | 'split ]]>'): void {
    if (terminator === 'refuse ]]>' && text.includes(']]>'))
      this.#fail(ErrorCode.WRITE_CDATA, ']]> cannot be written in a CDATA section');
    checkLiteral(text, { ...this.#escaper.options, unencodable: undefined }, 'a CDATA section');
    const unencodable = this.#encoder.unencodable;
    this.#output.write(unencodable?.test(text) === true ? cdataSectionsAround(text, unencodable) : cdataSections(text));
  }

  /** Writes a comment. */
  writeComment(text: string): void {
    this.#beforeChild();
    if (this.#checksWellFormedness && (text.includes('--') || text.endsWith('-'))) {
      this.#fail(ErrorCode.WRITE_COMMENT, 'A comment cannot hold -- or end with -');
    }
    checkLiteral(text, this.#escaper.options, 'a comment');
    this.#writeMarkup(`<!--${text}-->`);
  }

  /** Writes a processing instruction. */
  writeProcessingInstruction(target: string, data?: string): void {
    this.#beforeChild();
    if (this.#checksWellFormedness) {
      if (!this.#isName(target) || target.toLowerCase() === 'xml') {
        this.#fail(ErrorCode.WRITE_PI, `${target} is not a processing instruction target`);
      }
      if (data?.includes('?>') === true) this.#fail(ErrorCode.WRITE_PI, 'A processing instruction cannot hold ?>');
    }
    checkLiteral(target + (data ?? ''), this.#escaper.options, 'a processing instruction');
    const hasData = data !== undefined && data !== '';
    this.#writeMarkup(hasData ? `<?${target} ${data}?>` : `<?${target}?>`);
  }

  /** Writes markup that is not an element, on its own line when indenting. */
  #writeMarkup(markup: string): void {
    this.#indent(this.#openNames.length);
    this.#output.write(markup);
    this.#hasWritten = true;
  }

  /** Writes an entity reference. */
  writeEntityRef(name: string): void {
    this.#beforeContent();
    const depth = this.#openNames.length;
    if (this.#checksWellFormedness) this.#checkEntityRef(name, depth);
    this.#checkEncodable(name, 'an entity reference');
    this.#noteText(depth);
    this.#output.write(`&${name};`);
  }

  /** Throws unless a reference is by name, inside the root, and to a predefined entity or after a DOCTYPE (§4.1 WFC: Entity Declared). */
  #checkEntityRef(name: string, depth: number): void {
    if (!this.#isName(name)) this.#fail(ErrorCode.WRITE_NAME, `${name} is not an entity name`);
    if (depth === 0) this.#fail(ErrorCode.WRITE_STATE, 'Entity references go inside the root element');
    if (!this.#wroteDoctype && !PREDEFINED_ENTITY_NAMES.has(name)) {
      this.#fail(ErrorCode.WRITE_STATE, `&${name}; needs a DOCTYPE to declare ${name}`);
    }
  }

  /** Writes a DOM node and everything below it, declaring the namespaces it uses that are not declared. */
  writeNode(node: WritableNode): void {
    writeNode(this, node, this.#namespaceAware);
  }

  /** Hands what has been written to the sink. */
  flush(): void {
    this.#beforeContent();
    this.#output.flush();
  }

  /**
   * Writes what a reader reads, from where it stands: from the start of a document, the whole
   * document; from a start tag, that element, which can go inside a document being written. The
   * reader can be a cursor or a delegate, so what filters and delegates change is what is written.
   */
  copy(reader: CopiedReader): void {
    copyReader(this, reader);
  }

  /** Like `copy()`, waiting for an asynchronous reader's input and, before each wait, for the destination to have room. */
  copyAsync(reader: CopiedReader): Promise<void> {
    return copyReaderAsync(this, reader);
  }

  /** Resolves when the destination has room for more, so that a long run of writes can wait for a slow stream. */
  drain(): Promise<void> {
    return this.#output.drain();
  }

  /** Flushes and closes the sink; the promise settles when a stream sink has taken everything. */
  async close(): Promise<void> {
    this.#beforeContent();
    await this.#output.close();
  }
}
