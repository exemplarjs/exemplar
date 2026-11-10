import * as events from '@exemplarjs/xml';
import type { AttributeDeclaration, EntityDeclaration, NotationDeclaration } from '@exemplarjs/xml';
import {
  cursorOf,
  declarationName,
  DTD_ITEMS,
  type EntityListener,
  ErrorFactory,
  INCLUDED_DECLARATIONS,
  INPUT_ENCODING,
  LISTEN_ENTITIES,
  type StreamReader,
  XML_ENCODING,
  XMLNS_NAMESPACE,
} from '@exemplarjs/xml/internal';
import {
  Attr,
  CDATASection,
  Comment,
  type Document,
  DocumentType,
  Element,
  Entity,
  EntityReference,
  NO_ATTRIBUTES,
  type Node,
  NodeType,
  Notation,
  ProcessingInstruction,
  setEntityBase,
  Text,
  TypeInfo,
} from './nodes/index.ts';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const EventType = events.EventType;
type EventType = events.EventType;
const { ENTITY_REFERENCE_NODE, TEXT_NODE } = NodeType;

/** What `#elementContent` holds for an open element: whether the DTD gives it element content. */
const ELEMENT_CONTENT = 1;
const OTHER_CONTENT = 0;

/** The map a key holds in a map of maps, added when missing. */
function entry<K, V>(maps: Map<string, Map<K, V>>, key: string): Map<K, V> {
  let map = maps.get(key);
  if (map === undefined) {
    map = new Map();
    maps.set(key, map);
  }
  return map;
}
/** One TypeInfo for each attribute type, as they never change. */
const TYPES = new Map<string, TypeInfo>();

/** The shared TypeInfo for an attribute type. */
function typeInfo(type: string): TypeInfo {
  let info = TYPES.get(type);
  if (info === undefined) {
    info = new TypeInfo(type);
    TYPES.set(type, info);
  }
  return info;
}

/** What the builder's own options and the reader's `coalescing` decide of any tree it builds. */
export interface ContentOptions {
  readonly ignoringComments: boolean;
  readonly ignoringElementContentWhitespace: boolean;
  readonly coalescing: boolean;
}

/** The settings of a tree built from a cursor, resolved. */
export interface TreeOptions extends ContentOptions {
  readonly namespaceAware: boolean;
  /** Keep entity references as nodes holding their expansion, rather than putting the expansion in their place. */
  readonly entityReferences: boolean;
  /** Add `xmlns` attributes for the namespaces each element declares, as the reader does not report them as attributes. */
  readonly declaresNamespaces: boolean;
}

/**
 * Builds a tree from a cursor's events: `add` takes each event in turn and appends a node to the
 * current one, the element or entity reference being filled. It also hears where entities start and
 * end, so that it can wrap their expansions in entity reference nodes.
 */
export class TreeBuilder implements EntityListener {
  readonly reader: StreamReader;
  readonly document: Document;
  readonly #options: TreeOptions;
  /** The node being filled: the document, an open element, or an entity reference. */
  #current: Node;
  /** Whether each open element has element content, which makes its whitespace ignorable. */
  readonly #elementContent: number[] = [];
  /** The element names the DTD gives element content. */
  readonly #elementOnly = new Set<string>();
  /** The declared attributes, by element name and attribute name. */
  readonly #declared = new Map<string, Map<string, AttributeDeclaration>>();
  /** The DTD's entity declarations by name. */
  readonly #entities = new Map<string, EntityDeclaration>();
  #doctype: DocumentType | null = null;

  constructor(reader: StreamReader, document: Document, options: TreeOptions) {
    this.reader = reader;
    this.document = document;
    this.#options = options;
    this.#current = document;
    cursorOf(reader)[LISTEN_ENTITIES](this);
  }

  /** Adds what one event reports; returns true at the end of the document. */
  add(type: EventType): boolean {
    switch (type) {
      case EventType.START_ELEMENT: {
        this.#startElement();
        break;
      }
      case EventType.END_ELEMENT: {
        this.#current = this.#current._parent as Node;
        if (this.#elementOnly.size > 0) this.#elementContent.pop();
        break;
      }
      case EventType.CHARACTERS: {
        const isIgnorable = this.#inElementContent() && this.reader.isWhitespace();
        this.#characters(isIgnorable ? 'ignorable' : 'content');
        break;
      }
      case EventType.SPACE: {
        this.#characters('ignorable');
        break;
      }
      case EventType.CDATA: {
        if (this.#options.coalescing) this.#characters('content');
        else this.#current._append(new CDATASection(this.document, this.reader.text()));
        break;
      }
      default: {
        return this.#otherEvent(type);
      }
    }
    return false;
  }

  /** Adds what an event other than an element or text reports; returns true at the end of the document. */
  #otherEvent(type: EventType): boolean {
    const reader = this.reader;
    switch (type) {
      case EventType.COMMENT: {
        if (!this.#options.ignoringComments) this.#current._append(new Comment(this.document, reader.text()));
        break;
      }
      case EventType.PROCESSING_INSTRUCTION: {
        this.#current._append(new ProcessingInstruction(this.document, reader.piTarget(), reader.piData()));
        break;
      }
      case EventType.ENTITY_REFERENCE: {
        this.#current._append(entityReference(this.document, reader.name()));
        break;
      }
      case EventType.START_DOCUMENT: {
        this.#startDocument();
        break;
      }
      case EventType.DTD: {
        this.#dtd();
        break;
      }
      case EventType.END_DOCUMENT: {
        this.#addIncluded();
        this.document._changed();
        return true;
      }
      /* v8 ignore next -- unreachable but defensive */
      default: {
        throw ErrorFactory.create(Error, `The DOM builder received event ${type}, which it does not handle`);
      }
    }
    return false;
  }

  /** Takes the version, standalone flag and encodings from the XML declaration and the input. */
  #startDocument(): void {
    const reader = this.reader;
    const document = this.document;
    document._xmlVersion = reader.version() ?? '1.0';
    document._xmlStandalone = reader.standalone() ?? false;
    const cursor = cursorOf(reader);
    document._xmlEncoding = cursor[XML_ENCODING] ?? null;
    document._inputEncoding = cursor[INPUT_ENCODING]?.toUpperCase() ?? null;
  }

  /** Builds the document type from the DTD's declarations. */
  #dtd(): void {
    const reader = this.reader;
    const document = this.document;
    const doctype = reader.doctype();
    const node = new DocumentType(
      document,
      doctype.name,
      doctype.publicId ?? null,
      doctype.systemId ?? null,
      doctype.internalSubset || null
    );
    for (const entity of doctype.entities) {
      this.#entities.set(entity.name, entity);
      node._entities.push(dtdEntity(document, entity));
    }
    for (const notation of doctype.notations) node._notations.push(notationNode(document, notation));
    for (const item of cursorOf(reader)[DTD_ITEMS]()) {
      if (item.kind === 'element' && hasElementContent(item.declaration.content)) {
        this.#elementOnly.add(item.declaration.name);
      } else if (item.kind === 'attribute') {
        this.#attributeDeclaration(item.declaration);
      }
    }
    sealDoctype(node);
    this.#doctype = node;
    document._append(node);
  }

  /** Adds the unparsed entities and notations XInclude brought in to the document type, making one if need be. */
  #addIncluded(): void {
    const items = cursorOf(this.reader)[INCLUDED_DECLARATIONS]();
    if (items.length === 0) return;
    const doctype = this.#doctype ?? this.#impliedDoctype();
    for (const item of items) {
      if (item.kind === 'entity') addDeclared(doctype._entities, entityNode(this.document, item.declaration));
      else if (item.kind === 'notation') addDeclared(doctype._notations, notationNode(this.document, item.declaration));
    }
    // The maps' index properties are copies, brought up to date after the arrays change.
    doctype.entities._sync();
    doctype.notations._sync();
  }

  /** A document type for a document that has none, named after its element and put before it. */
  #impliedDoctype(): DocumentType {
    const document = this.document;
    const doctype = new DocumentType(document, (document.documentElement as Element).nodeName, null, null, null);
    document._insert(doctype, document.documentElement);
    this.#doctype = doctype;
    return doctype;
  }

  /** Records an attribute's first declaration (§3.3), and its default for removed attributes to fall back on. */
  #attributeDeclaration(declaration: AttributeDeclaration): void {
    const declared = entry(this.#declared, declaration.element);
    declared.set(declaration.name, declaration);
    if (declaration.value === undefined) return;
    const defaults = entry(this.document._defaults, declaration.element);
    const type = declaration.type === 'ENUMERATION' ? 'NMTOKEN' : declaration.type;
    defaults.set(declaration.name, { value: declaration.value, id: declaration.type === 'ID', type });
  }

  /** Adds an element with its attributes, and opens it. */
  #startElement(): void {
    const reader = this.reader;
    const document = this.document;
    const name = reader.name();
    const declarations = this.#options.declaresNamespaces ? reader.namespaceCount() : 0;
    const count = declarations + reader.attributeCount();
    // A literal, not an array made with its length, which slows garbage collection of large trees.
    const attributes: Attr[] = count === 0 ? NO_ATTRIBUTES : [];
    const element = this.#options.namespaceAware
      ? new Element(
          document,
          name,
          this.#namespaceOrNull(reader.namespaceURI()),
          this.#localName(name, reader),
          attributes
        )
      : new Element(document, name, null, null, attributes);
    const declared = this.#declared.size === 0 ? undefined : this.#declared.get(name);
    for (let i = 0; i < declarations; i++) attributes[i] = this.#declaration(element, i);
    for (let i = declarations; i < count; i++) attributes[i] = this.#attribute(element, i - declarations, declared);
    if (this.#current.nodeType === ENTITY_REFERENCE_NODE) this.#entityBase(element);
    this.#current._append(element);
    this.#current = element;
    if (this.#elementOnly.size > 0) {
      this.#elementContent.push(this.#elementOnly.has(name) ? ELEMENT_CONTENT : OTHER_CONTENT);
    }
  }

  /** The cursor's attribute at an index, owned by its element; typed when the DTD declares it. */
  #attribute(element: Element, index: number, declared: Map<string, AttributeDeclaration> | undefined): Attr {
    const reader = this.reader;
    const name = reader.attributeName(index);
    const attr = this.#options.namespaceAware
      ? new Attr(
          this.document,
          name,
          this.#namespaceOrNull(reader.attributeNamespace(index)),
          this.#attributeLocalName(name, index)
        )
      : new Attr(this.document, name, null, null);
    attr._setParsed(reader.attributeValue(index), reader.isAttributeSpecified(index));
    const type = reader.attributeType(index);
    if (declared?.has(name) === true) attr._type = typeInfo(type);
    // Declared IDs and xml:id attributes alike.
    attr._isId = type === 'ID';
    attr._ownerElement = element;
    return attr;
  }

  /** The `xmlns` attribute for the cursor's namespace declaration at an index, owned by its element. */
  #declaration(element: Element, index: number): Attr {
    const attr = xmlnsAttribute(this.document, this.reader.namespacePrefix(index), this.reader.namespaceURI(index));
    attr._ownerElement = element;
    return attr;
  }

  /** Declares bindings on the element just added, as an element built on its own inherits them from its ancestors. */
  inherit(bindings: ReadonlyMap<string, string>): void {
    const element = this.#current as Element;
    for (const [prefix, uri] of bindings) element.setAttributeNodeNS(xmlnsAttribute(this.document, prefix, uri));
  }

  /** Whether the open element has element content, which makes whitespace in it ignorable. */
  #inElementContent(): boolean {
    return this.#elementOnly.size > 0 && this.#elementContent.at(-1) === ELEMENT_CONTENT;
  }

  /** Gives an element at the top of an external entity, directly or through internal ones, the URI the cursor read it from. */
  #entityBase(element: Element): void {
    for (
      let ancestor: Node | null = this.#current;
      ancestor?.nodeType === ENTITY_REFERENCE_NODE;
      ancestor = ancestor._parent
    ) {
      if (this.#entities.get(ancestor.nodeName)?.systemId === undefined) continue;
      const uri = this.reader.location().systemId;
      if (uri !== undefined) setEntityBase(element, uri);
      return;
    }
  }

  /** A namespace URI as the tree keeps it: null for none. */
  #namespaceOrNull(uri: string): string | null {
    return uri === '' ? null : uri;
  }

  /** An element's local name, which is its name when it has no prefix. */
  #localName(name: string, reader: StreamReader): string {
    return name.includes(':') ? reader.localName() : name;
  }

  /** An attribute's local name, which is its name when it has no prefix. */
  #attributeLocalName(name: string, index: number): string {
    return name.includes(':') ? this.reader.attributeLocalName(index) : name;
  }

  /** Adds text, joining it to text just before it. */
  #characters(kind: 'ignorable' | 'content'): void {
    const ignorable = kind === 'ignorable';
    if (ignorable && this.#options.ignoringElementContentWhitespace) return;
    if (this.#current === this.document) return;
    const text = this.reader.text();
    const last = this.#current._last;
    if (last?.nodeType === TEXT_NODE) {
      (last as Text)._data += text;
      // Whitespace joined by other text is no longer element-content whitespace.
      if (!ignorable) (last as Text)._ignorable = false;
      return;
    }
    const node = new Text(this.document, text);
    node._ignorable = ignorable;
    this.#current._append(node);
  }

  /** Records the encodings and version an external entity was first read with. */
  readExternal(name: string, inputEncoding?: string, xmlEncoding?: string, xmlVersion?: string): void {
    const entity = this.#entityNode(name);
    if (entity?._inputEncoding !== null) return;
    entity._inputEncoding = inputEncoding?.toUpperCase() ?? null;
    entity._xmlEncoding = xmlEncoding ?? null;
    entity._xmlVersion = xmlVersion ?? null;
  }

  /** Opens an entity reference node as the cursor starts an entity's expansion. */
  startEntity(name: string): void {
    if (this.#current === this.document) return;
    const node = new EntityReference(this.document, name);
    this.#current._append(node);
    this.#current = node;
  }

  /** Ends an entity reference: the entity node takes a copy of its first expansion, and the reference stays or gives way to it. */
  endEntity(name: string): void {
    const node = this.#current;
    if (node.nodeType !== ENTITY_REFERENCE_NODE || node.nodeName !== name) return;
    this.#fillEntity(name, node);
    const parent = node._parent as Node;
    this.#current = parent;
    if (this.#options.entityReferences) node._setReadonly(true);
    else replaceWithChildren(parent, node);
  }

  /** Gives the entity node a read-only copy of a reference's children, if it has no children yet. */
  #fillEntity(name: string, reference: Node): void {
    const entity = this.#entityNode(name);
    if (entity?._first !== null) return;
    for (let child = reference._first; child !== null; child = child._next)
      entity._append(child._clone(this.document, true));
    entity._setReadonly(true);
  }

  /** The document type's entity node of a name. */
  #entityNode(name: string): Entity | undefined {
    return this.#doctype?._entities.find((entity) => entity.nodeName === name) as Entity | undefined;
  }
}

/** An `xmlns` attribute declaring a prefix, `''` for the default namespace. */
export function xmlnsAttribute(document: Document, prefix: string, uri: string): Attr {
  const localName = prefix === '' ? 'xmlns' : prefix;
  const attr = new Attr(document, declarationName(prefix), XMLNS_NAMESPACE, localName);
  attr._setParsed(uri, true);
  return attr;
}

/** Whether an element declaration's content model gives element content: children, not EMPTY, ANY or Mixed (XML 1.0 [46]). */
export function hasElementContent(content: string): boolean {
  return content.startsWith('(') && !content.startsWith('(#PCDATA');
}

/** A read-only entity reference node, for an entity the parser did not expand. */
export function entityReference(document: Document, name: string): EntityReference {
  const node = new EntityReference(document, name);
  node._readonly = true;
  return node;
}

/** Makes a document type and its entities and notations read-only, its lists brought up to date. */
export function sealDoctype(node: DocumentType): void {
  node.entities._sync();
  node.notations._sync();
  for (const declaration of [...node._entities, ...node._notations]) declaration._setReadonly(true);
  node._readonly = true;
}

/** An entity node for a declaration, without children. */
function entityNode(document: Document, declaration: EntityDeclaration): Entity {
  const { name, publicId, systemId, notation } = declaration;
  const entity = new Entity(document, name, publicId ?? null, systemId ?? null, notation ?? null);
  entity._baseURI = declaration.baseURI ?? null;
  return entity;
}

/** The entity node for a DTD declaration, holding its value when that is plain text; others take their first expansion. */
function dtdEntity(document: Document, declaration: EntityDeclaration): Entity {
  const entity = entityNode(document, declaration);
  if (isPlainText(declaration.value)) entity._append(new Text(document, declaration.value));
  return entity;
}

/** Whether an entity's value is non-empty text without markup or references. */
export function isPlainText(value: string | undefined): value is string {
  return value !== undefined && value !== '' && !value.includes('<') && !value.includes('&');
}

/** A notation node for a declaration. */
function notationNode(document: Document, declaration: NotationDeclaration): Notation {
  const notation = new Notation(document, declaration.name, declaration.publicId ?? null, declaration.systemId ?? null);
  notation._baseURI = declaration.baseURI ?? null;
  return notation;
}

/** Adds an entity or notation to a document type's list, read-only, unless the list has one of its name. */
export function addDeclared(list: Node[], node: Entity | Notation): void {
  if (list.some((existing) => existing.nodeName === node.nodeName)) return;
  node._readonly = true;
  list.push(node);
}

/** Puts an entity reference's children in its place at the end of its parent, joining text to the text before it. */
function replaceWithChildren(parent: Node, reference: Node): void {
  parent._unlink(reference);
  for (let child = reference._first; child !== null;) {
    const next = child._next;
    const last = parent._last;
    if (last?.nodeType === TEXT_NODE && child.nodeType === TEXT_NODE) joinText(last as Text, child as Text);
    else parent._append(child);
    child = next;
  }
}

/** Joins a text node onto the one before it; the result is element-content whitespace only if both were. */
export function joinText(before: Text, text: Text): void {
  before._data += text._data;
  before._ignorable &&= text._ignorable;
}
