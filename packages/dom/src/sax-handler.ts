import { IllegalStateError } from '@exemplarjs/xml';
import type { Location } from '@exemplarjs/xml';
import {
  checkName,
  checkQName,
  declaredPrefixOf,
  ErrorFactory,
  isAllWhitespace,
  locationOf,
  prefixOf,
  type SAXAttributes,
  type SAXLocator,
  StructureCheck,
} from '@exemplarjs/xml/internal';
import {
  Attr,
  CDATASection,
  Comment,
  Document,
  DocumentType,
  type DOMImplementation,
  Element,
  Entity,
  NO_ATTRIBUTES,
  type Node,
  NodeType,
  Notation,
  ProcessingInstruction,
  Text,
} from './nodes/index.ts';
import {
  addDeclared,
  type ContentOptions,
  entityReference,
  hasElementContent,
  isPlainText,
  joinText,
  sealDoctype,
  xmlnsAttribute,
} from './tree-builder.ts';

// Module-level constants, so V8 can inline them; imported bindings are read again on every use.
const { TEXT_NODE } = NodeType;

/**
 * A SAX handler that builds a DOM tree from the events it is given, as
 * `DocumentBuilder.createSAXHandler()` makes one. It ends a chain of SAX filters, so that what they
 * change is what the tree holds:
 *
 * ```ts
 * const handler = builder.createSAXHandler();
 * new SAXParser().parse(source, new RenamingFilter(handler));
 * handler.document.documentElement;
 * ```
 *
 * Namespace-aware events make namespace-aware nodes, with `xmlns` attributes for the prefix
 * mappings; others make nodes without namespaces. CDATA sections stay sections unless the factory
 * coalesces them, entity references the parser skipped become entity reference nodes, and the DTD
 * gives the document type its entities and notations. The events are checked as they come, as the
 * XDM handler checks them. Each `startDocument` starts a new document.
 */
export class DOMBuildingHandler {
  readonly #implementation: DOMImplementation;
  readonly #options: ContentOptions;
  /** Where the events are, for the errors the checks throw. */
  readonly #where = (): Location => locationOf(this.#locator);
  #structure = new StructureCheck(this.#where);
  #locator: SAXLocator | undefined;
  #building: Document | undefined;
  #finished: Document | undefined;
  /** The node being filled: the document, or an open element. */
  #current: Node | undefined;
  /** The prefix mappings for the next start tag. */
  readonly #pendingPrefixes: string[] = [];
  readonly #pendingURIs: string[] = [];
  /** The document type being read, while the DTD's events come. */
  #doctype: DocumentType | undefined;
  /** The element names the DTD gives element content, in which whitespace is ignorable. */
  readonly #elementOnly = new Set<string>();
  /** Whether each open element has element content. */
  readonly #elementContent: boolean[] = [];
  /** The CDATA section being read; undefined outside one, or with coalescing. */
  #cdata: CDATASection | undefined;
  #inCDATA = false;

  /** A handler whose documents belong to `implementation`. @internal */
  constructor(implementation: DOMImplementation, options: ContentOptions) {
    this.#implementation = implementation;
    this.#options = options;
  }

  /** The document built, once `endDocument` has been called. */
  get document(): Document {
    if (this.#finished === undefined) throw ErrorFactory.create(IllegalStateError, 'The document is not finished yet');
    return this.#finished;
  }

  setDocumentLocator(locator: SAXLocator): void {
    this.#locator = locator;
  }

  startDocument(): void {
    const document = new Document(this.#implementation);
    document._documentURI = this.#locator?.systemId ?? null;
    document._xmlVersion = this.#locator?.xmlVersion ?? '1.0';
    this.#building = document;
    this.#current = document;
    this.#finished = undefined;
    this.#structure = new StructureCheck(this.#where);
    this.#pendingPrefixes.length = 0;
    this.#pendingURIs.length = 0;
    this.#elementOnly.clear();
    this.#elementContent.length = 0;
    this.#doctype = undefined;
    this.#cdata = undefined;
    this.#inCDATA = false;
  }

  endDocument(): void {
    this.#structure.endDocument();
    const document = this.#started();
    document._changed();
    this.#finished = document;
  }

  startPrefixMapping(prefix: string, uri: string): void {
    this.#pendingPrefixes.push(prefix);
    this.#pendingURIs.push(uri);
  }

  startElement(uri: string, localName: string, qName: string, attributes: SAXAttributes): void {
    const document = this.#started();
    this.#structure.startElement(qName);
    // Events without namespaces have neither a local name nor a URI.
    const namespaceAware = localName !== '' || uri !== '';
    if (namespaceAware) checkQName('element', qName, localName, prefixOf(qName), uri, this.#where);
    else checkName('element', qName, this.#where);
    const prefixes = this.#pendingPrefixes;
    const attributeNodes: Attr[] = prefixes.length + attributes.length === 0 ? NO_ATTRIBUTES : [];
    const namespace = uri === '' ? null : uri;
    const element = namespaceAware
      ? new Element(document, qName, namespace, localName, attributeNodes)
      : new Element(document, qName, null, null, attributeNodes);
    for (let i = 0; i < prefixes.length; i++) {
      const declaration = xmlnsAttribute(document, prefixes[i] as string, this.#pendingURIs[i] as string);
      attributeNodes.push(owned(declaration, element));
    }
    for (let i = 0; i < attributes.length; i++) {
      const attr = this.#attribute(document, attributes, i, namespaceAware);
      if (attr !== undefined) attributeNodes.push(owned(attr, element));
    }
    if (prefixes.length > 0) {
      prefixes.length = 0;
      this.#pendingURIs.length = 0;
    }
    (this.#current as Node)._append(element);
    this.#current = element;
    if (this.#elementOnly.size > 0) this.#elementContent.push(this.#elementOnly.has(qName));
  }

  endElement(_uri: string, _localName: string, qName: string): void {
    this.#structure.endElement(qName);
    this.#current = (this.#current as Node)._parent as Node;
    if (this.#elementOnly.size > 0) this.#elementContent.pop();
  }

  characters(text: string): void {
    if (this.#structure.depth === 0) {
      this.#structure.outsideRoot(isAllWhitespace(text));
      return;
    }
    if (this.#inCDATA && !this.#options.coalescing) this.#cdataText(text);
    else if (this.#elementContent.at(-1) === true && isAllWhitespace(text)) this.ignorableWhitespace(text);
    else this.#text(text, 'content');
  }

  ignorableWhitespace(text: string): void {
    if (!this.#options.ignoringElementContentWhitespace && this.#structure.depth > 0) this.#text(text, 'ignorable');
  }

  startCDATA(): void {
    this.#inCDATA = true;
  }

  endCDATA(): void {
    this.#inCDATA = false;
    this.#cdata = undefined;
  }

  comment(text: string): void {
    if (this.#doctype === undefined && !this.#options.ignoringComments) {
      (this.#current as Node)._append(new Comment(this.#started(), text));
    }
  }

  processingInstruction(target: string, data: string): void {
    if (this.#doctype === undefined) {
      (this.#current as Node)._append(new ProcessingInstruction(this.#started(), target, data));
    }
  }

  skippedEntity(name: string): void {
    if (this.#structure.depth > 0) (this.#current as Node)._append(entityReference(this.#started(), name));
  }

  startDTD(name: string, publicId: string | undefined, systemId: string | undefined): void {
    this.#doctype = new DocumentType(this.#started(), name, publicId ?? null, systemId ?? null, null);
  }

  endDTD(): void {
    const doctype = this.#doctype as DocumentType;
    sealDoctype(doctype);
    this.#doctype = undefined;
    this.#started()._append(doctype);
  }

  /** Notes an element the DTD gives element content, in which whitespace is ignorable. */
  elementDecl(name: string, model: string): void {
    if (hasElementContent(model)) this.#elementOnly.add(name);
  }

  internalEntityDecl(name: string, value: string): void {
    if (name.startsWith('%')) return;
    const entity = new Entity(this.#started(), name, null, null, null);
    // Plain text is the entity's content; any other value fills in as a reference to it is read.
    if (isPlainText(value)) entity._append(new Text(this.#started(), value));
    this.#declare(entity);
  }

  externalEntityDecl(name: string, publicId: string | undefined, systemId: string): void {
    if (!name.startsWith('%')) this.#declare(new Entity(this.#started(), name, publicId ?? null, systemId, null));
  }

  unparsedEntityDecl(name: string, publicId: string | undefined, systemId: string, notationName: string): void {
    this.#declare(new Entity(this.#started(), name, publicId ?? null, systemId, notationName));
  }

  notationDecl(name: string, publicId: string | undefined, systemId: string | undefined): void {
    const doctype = this.#doctype;
    if (doctype === undefined) return;
    addDeclared(doctype._notations, new Notation(this.#started(), name, publicId ?? null, systemId ?? null));
  }

  /** The document being built; events before `startDocument` are refused. */
  #started(): Document {
    if (this.#building === undefined) throw ErrorFactory.create(IllegalStateError, 'startDocument must come first');
    return this.#building;
  }

  /** The attribute node for attribute `index`; undefined for a declaration that a prefix mapping carries already. */
  #attribute(document: Document, attributes: SAXAttributes, index: number, namespaceAware: boolean): Attr | undefined {
    const name = attributes.qName(index);
    if (!namespaceAware) {
      checkName('attribute', name, this.#where);
      return parsed(new Attr(document, name, null, null), attributes, index);
    }
    const declared = declaredPrefixOf(name);
    if (declared !== undefined) {
      if (this.#pendingPrefixes.includes(declared)) return undefined;
      return parsed(xmlnsAttribute(document, declared, attributes.value(index)), attributes, index);
    }
    const uri = attributes.uri(index);
    const localName = attributes.localName(index);
    checkQName('attribute', name, localName, prefixOf(name), uri, this.#where);
    return parsed(new Attr(document, name, uri === '' ? null : uri, localName), attributes, index);
  }

  /** Adds text, joining it to text just before it; whitespace in element content is ignorable. */
  #text(text: string, kind: 'ignorable' | 'content'): void {
    const current = this.#current as Node;
    const node = new Text(this.#started(), text);
    node._ignorable = kind === 'ignorable';
    const last = current._last;
    if (last?.nodeType === TEXT_NODE) joinText(last as Text, node);
    else current._append(node);
  }

  /** Adds text to the CDATA section being read, starting it with the first. */
  #cdataText(text: string): void {
    if (this.#cdata === undefined) {
      this.#cdata = new CDATASection(this.#started(), text);
      (this.#current as Node)._append(this.#cdata);
    } else {
      this.#cdata._data += text;
    }
  }

  /** Adds an entity to the document type being read, unless it has one of the name already; none outside the DTD. */
  #declare(entity: Entity): void {
    if (this.#doctype !== undefined) addDeclared(this.#doctype._entities, entity);
  }
}

/** An attribute owned by its element. */
function owned(attr: Attr, element: Element): Attr {
  attr._ownerElement = element;
  return attr;
}

/** An attribute given its value and whether it was specified, and made an ID when its type is. */
function parsed(attr: Attr, attributes: SAXAttributes, index: number): Attr {
  attr._setParsed(attributes.value(index), attributes.isSpecified(index));
  attr._isId = attributes.type(index) === 'ID';
  return attr;
}
