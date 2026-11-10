import { ErrorFactory, GROWTH_FACTOR } from '@exemplarjs/xml/internal';
import { NameTable, NO_NAME } from '@/names/name-table';
import { NodeKind } from '@/node-kind';
import { Columns } from './columns.ts';
import { NO_NODE, Tree, type UnparsedEntity } from './tree.ts';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { COMMENT, DOCUMENT, ELEMENT, PROCESSING_INSTRUCTION, TEXT } = NodeKind;

/** Raises a RangeError for a node after the root has ended, as a tree has one root. */
function secondRoot(): never {
  throw ErrorFactory.create(RangeError, 'A tree has one root, which has already ended');
}

/** How many nodes the arrays hold at first, unless told otherwise, and at least. */
const INITIAL_NODES = 1024;
const MIN_NODES = 64;

/** How many attributes to make room for per node expected, and at least. */
const ATTRIBUTES_PER_NODE = 0.125;
const MIN_ATTRIBUTES = 16;

/** How many pieces of text are joined into one chunk as the tree is built. */
const TEXT_CHUNK_PIECES = 4096;

/** The node columns, by index among the Int32 columns and among the Uint8 ones. */
const NodeInt32Column = { PARENTS: 0, ENDS: 1, NAME_CODES: 2, TEXT_OFFSETS: 3, ATTRIBUTE_OFFSETS: 4 } as const;
const NodeUint8Column = { KINDS: 0 } as const;
const NODE_INT32_COLUMNS = Object.keys(NodeInt32Column).length;
const NODE_UINT8_COLUMNS = Object.keys(NodeUint8Column).length;

/** The attribute columns, by index among the Int32 columns and among the Uint8 ones. */
const AttributeInt32Column = { OWNERS: 0, NAME_CODES: 1 } as const;
const AttributeUint8Column = { FLAGS: 0 } as const;
const ATTRIBUTE_INT32_COLUMNS = Object.keys(AttributeInt32Column).length;
const ATTRIBUTE_UINT8_COLUMNS = Object.keys(AttributeUint8Column).length;

/** What a TreeBuilder starts from. */
export interface TreeBuilderOptions {
  /** How many nodes to make room for at first; the arrays grow as needed. */
  readonly expectedNodes?: number;
  /** The table to add names to, which trees may share; a new one by default. */
  readonly names?: NameTable;
}

/**
 * Builds a Tree from calls in document order: start a node, add its attributes and namespaces,
 * add its content, end it. It knows nothing of where the nodes come from, so a parser, an XSLT
 * result or an XQuery constructor can drive it alike.
 *
 * ```ts
 * const builder = new TreeBuilder();
 * builder.startDocument(null);
 * builder.startElement(builder.names.code('greeting', ''));
 * builder.text('hello');
 * builder.endElement();
 * builder.endDocument();
 * const tree = builder.finish();
 * tree.stringValue(0); // 'hello'
 * ```
 *
 * Attributes and namespace declarations belong to the element just started, and must come before
 * its content. Adjacent text joins into one text node, and empty text makes none.
 */
export class TreeBuilder {
  readonly names: NameTable;
  #size = 0;
  /** The node arrays, with room for more than `#size` nodes, leaving room for the end entries. */
  #nodes: Columns;
  #kinds!: Uint8Array;
  #parents!: Int32Array;
  #ends!: Int32Array;
  #nameCodes!: Int32Array;
  #textOffsets!: Int32Array;
  #attributeOffsets!: Int32Array;
  /** The node being filled: the document or an open element. */
  #current = NO_NODE;
  /** The text node that more text joins, or NO_NODE when the next text starts a new one. */
  #openText = NO_NODE;
  /** The text of every text node: joined chunks, and the pieces since the last chunk. */
  readonly #textChunks: string[] = [];
  readonly #texts: string[] = [];
  #textLength = 0;
  readonly #contents = new Map<number, string>();
  #attributeCount = 0;
  #attributes: Columns;
  #attributeOwners!: Int32Array;
  #attributeNames!: Int32Array;
  readonly #attributeValues: string[] = [];
  #attributeFlags!: Uint8Array;
  readonly #namespaceOwners: number[] = [];
  readonly #namespacePrefixes: string[] = [];
  readonly #namespaceURIs: string[] = [];
  #documentURI: string | null = null;
  readonly #baseURIs = new Map<number, string>();
  readonly #unparsedEntities = new Map<string, UnparsedEntity>();

  constructor(options: TreeBuilderOptions = {}) {
    this.names = options.names ?? new NameTable();
    // Every element has an xml namespace node, named by a prefix no document declares.
    this.names.code('xml', '');
    const nodeCapacity = Math.max(options.expectedNodes ?? INITIAL_NODES, MIN_NODES);
    this.#nodes = this.#useNodes(new Columns(nodeCapacity + 1, NODE_INT32_COLUMNS, NODE_UINT8_COLUMNS));
    const attributeCapacity = Math.max(Math.ceil(nodeCapacity * ATTRIBUTES_PER_NODE), MIN_ATTRIBUTES);
    this.#attributes = this.#useAttributes(
      new Columns(attributeCapacity, ATTRIBUTE_INT32_COLUMNS, ATTRIBUTE_UINT8_COLUMNS)
    );
  }

  /** The node being filled, or NO_NODE before the document starts and after it ends. */
  get current(): number {
    return this.#current;
  }

  /** Starts the document node. */
  startDocument(documentURI: string | null): void {
    this.#documentURI = documentURI;
    this.#current = this.#addNode(DOCUMENT, NO_NAME);
  }

  /** Gives the document the URI it was read from, after it has started. */
  setDocumentURI(documentURI: string | null): void {
    this.#documentURI = documentURI;
  }

  /** Ends the document node. */
  endDocument(): void {
    this.endElement();
  }

  /** Starts an element with a name code from `names`; returns its node number. */
  startElement(nameCode: number): number {
    const node = this.#addNode(ELEMENT, nameCode);
    this.#current = node;
    this.#openText = NO_NODE;
    return node;
  }

  /** Ends the open element. */
  endElement(): void {
    const node = this.#current;
    this.#ends[node] = this.#size;
    this.#current = this.#parents[node] as number;
    this.#openText = NO_NODE;
  }

  /** Adds an attribute to the element just started, with AttributeFlag bits. */
  attribute(nameCode: number, value: string, flags: number): void {
    const attribute = this.#attributeCount;
    if (attribute === this.#attributes.capacity) this.#growAttributes();
    this.#attributeOwners[attribute] = this.#current;
    this.#attributeNames[attribute] = nameCode;
    this.#attributeFlags[attribute] = flags;
    this.#attributeValues.push(value);
    this.#attributeCount = attribute + 1;
  }

  /** Adds a namespace declaration to the element just started; an empty URI undeclares the prefix. */
  namespace(prefix: string, uri: string): void {
    // A namespace node is named by its prefix, so the name table holds it for name tests.
    if (prefix !== '') this.names.code(prefix, '');
    this.#namespaceOwners.push(this.#current);
    this.#namespacePrefixes.push(prefix);
    this.#namespaceURIs.push(uri);
  }

  /** Adds text, joining it to text just before it. */
  text(text: string): void {
    if (text === '') return;
    if (this.#openText === NO_NODE) this.#openText = this.#addNode(TEXT, NO_NAME);
    const texts = this.#texts;
    texts.push(text);
    this.#textLength += text.length;
    // Joining as it goes lets the pieces, often slices of the input, be collected young.
    if (texts.length === TEXT_CHUNK_PIECES) this.#joinTexts();
  }

  /** Joins the pieces of text since the last chunk into a new chunk. */
  #joinTexts(): void {
    this.#textChunks.push(this.#texts.join(''));
    this.#texts.length = 0;
  }

  /** Adds a comment. */
  comment(content: string): void {
    this.#contents.set(this.#addNode(COMMENT, NO_NAME), content);
    this.#openText = NO_NODE;
  }

  /** Adds a processing instruction, its target a name code in no namespace, and returns its number. */
  processingInstruction(targetCode: number, data: string): number {
    const node = this.#addNode(PROCESSING_INSTRUCTION, targetCode);
    this.#contents.set(node, data);
    this.#openText = NO_NODE;
    return node;
  }

  /** Gives a node a base URI of its own: an element or instruction read from an external entity, or a document read from elsewhere. */
  setBaseURI(node: number, uri: string): void {
    this.#baseURIs.set(node, uri);
  }

  /** Records an unparsed entity the DTD declares. */
  addUnparsedEntity(name: string, entity: UnparsedEntity): void {
    if (!this.#unparsedEntities.has(name)) this.#unparsedEntities.set(name, entity);
  }

  /** The finished tree; the builder must not be used after. */
  finish(): Tree {
    const size = this.#size;
    const attributeCount = this.#attributeCount;
    // The end entries, after the last node.
    this.#textOffsets[size] = this.#textLength;
    this.#attributeOffsets[size] = attributeCount;
    const nodes = this.#nodes.trimmed(size + 1);
    const attributes = this.#attributes.trimmed(attributeCount);
    this.#joinTexts();
    return new Tree({
      names: this.names,
      size,
      kinds: nodes.uint8At(NodeUint8Column.KINDS),
      parents: nodes.int32At(NodeInt32Column.PARENTS),
      ends: nodes.int32At(NodeInt32Column.ENDS),
      nameCodes: nodes.int32At(NodeInt32Column.NAME_CODES),
      textOffsets: nodes.int32At(NodeInt32Column.TEXT_OFFSETS),
      attributeOffsets: nodes.int32At(NodeInt32Column.ATTRIBUTE_OFFSETS),
      text: this.#textChunks.join(''),
      contents: this.#contents,
      attributeCount,
      attributeOwners: attributes.int32At(AttributeInt32Column.OWNERS),
      attributeNames: attributes.int32At(AttributeInt32Column.NAME_CODES),
      attributeValues: this.#attributeValues,
      attributeFlags: attributes.uint8At(AttributeUint8Column.FLAGS),
      namespaceOwners: Int32Array.from(this.#namespaceOwners),
      namespacePrefixes: this.#namespacePrefixes,
      namespaceURIs: this.#namespaceURIs,
      documentURI: this.#documentURI,
      baseURIs: this.#baseURIs,
      unparsedEntities: this.#unparsedEntities,
    });
  }

  /** Adds a node to the one being filled; returns its number. */
  #addNode(kind: NodeKind, nameCode: number): number {
    const node = this.#size;
    if (this.#current === NO_NODE && node !== 0) secondRoot();
    if (node + 1 === this.#nodes.capacity) this.#grow();
    this.#kinds[node] = kind;
    this.#parents[node] = this.#current;
    this.#ends[node] = node + 1;
    this.#nameCodes[node] = nameCode;
    this.#textOffsets[node] = this.#textLength;
    this.#attributeOffsets[node] = this.#attributeCount;
    this.#size = node + 1;
    return node;
  }

  /** Doubles the room for nodes. */
  #grow(): void {
    this.#nodes = this.#useNodes(this.#nodes.resized(this.#nodes.capacity * GROWTH_FACTOR, this.#size));
  }

  /** Doubles the room for attributes. */
  #growAttributes(): void {
    const attributes = this.#attributes;
    this.#attributes = this.#useAttributes(
      attributes.resized(attributes.capacity * GROWTH_FACTOR, this.#attributeCount)
    );
  }

  /** Points the node fields at new columns; returns them. */
  #useNodes(nodes: Columns): Columns {
    this.#parents = nodes.int32At(NodeInt32Column.PARENTS);
    this.#ends = nodes.int32At(NodeInt32Column.ENDS);
    this.#nameCodes = nodes.int32At(NodeInt32Column.NAME_CODES);
    this.#textOffsets = nodes.int32At(NodeInt32Column.TEXT_OFFSETS);
    this.#attributeOffsets = nodes.int32At(NodeInt32Column.ATTRIBUTE_OFFSETS);
    this.#kinds = nodes.uint8At(NodeUint8Column.KINDS);
    return nodes;
  }

  /** Points the attribute fields at new columns; returns them. */
  #useAttributes(attributes: Columns): Columns {
    this.#attributeOwners = attributes.int32At(AttributeInt32Column.OWNERS);
    this.#attributeNames = attributes.int32At(AttributeInt32Column.NAME_CODES);
    this.#attributeFlags = attributes.uint8At(AttributeUint8Column.FLAGS);
    return attributes;
  }
}
