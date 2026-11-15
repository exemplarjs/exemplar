import type { QName } from '@exemplarjs/xml';
import { type NameTable, NO_NAME } from '@/names/name-table';
import { NodeKind } from '@/node-kind';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { COMMENT, PROCESSING_INSTRUCTION } = NodeKind;

/** No node: the parent of a root, and what navigation returns when there is no node to go to. */
export const NO_NODE = -1;

/** The root node of a tree, the first in document order. */
export const ROOT_NODE = 0;

/** The bits of an attribute's flags. */
export const AttributeFlag = {
  /** No flags: an attribute that is neither an ID nor an ID reference. */
  NONE: 0,
  /** `dm:is-id`: the DTD declares it an ID, or it is `xml:id`. */
  ID: 1,
  /** `dm:is-idrefs`: the DTD declares it IDREF or IDREFS. */
  IDREFS: 2,
} as const;

/** An unparsed entity the DTD declares, as `fn:unparsed-entity-uri` and `fn:unparsed-entity-public-id` report it. */
export interface UnparsedEntity {
  /** The system identifier, made absolute against the declaration's base URI. */
  readonly systemId: string;
  /** The public identifier, or the empty string. */
  readonly publicId: string;
}

/** What a tree is made of, as a TreeBuilder hands it over. */
export type TreeParts = Pick<
  Tree,
  | 'names'
  | 'size'
  | 'kinds'
  | 'parents'
  | 'ends'
  | 'nameCodes'
  | 'textOffsets'
  | 'attributeOffsets'
  | 'text'
  | 'contents'
  | 'attributeCount'
  | 'attributeOwners'
  | 'attributeNames'
  | 'attributeValues'
  | 'attributeFlags'
  | 'namespaceOwners'
  | 'namespacePrefixes'
  | 'namespaceURIs'
  | 'documentURI'
  | 'baseURIs'
  | 'unparsedEntities'
>;

/** The number the next tree gets, which orders nodes of different trees. */
let nextTreeNumber = 0;

/**
 * The nodes of one document, held in arrays indexed by node number, in document order.
 *
 * ```text
 * <a x="1">hi<b/></a>     node  kind      parent  end  textOffset
 *                         0     document  -1      4    0
 *                         1     element   0       4    0
 *                         2     text      1       3    0
 *                         3     element   1       4    2
 * ```
 *
 * Nodes are numbered in document order, so a node's children and descendants follow it, up to
 * its `end`: the first node after its subtree. Navigation is arithmetic on the arrays:
 *
 * - the first child of `n` is `n + 1`, when that is below `end(n)`;
 * - the next sibling is `end(n)`, when that is below its parent's end;
 * - the descendants are the nodes from `n + 1` up to `end(n)`.
 *
 * All text is one string. `textOffset(n)` is how much text comes before node `n`, so the string
 * value of an element or document, all the text inside it, is one slice, as is a text node's.
 *
 * Attributes and namespace declarations sit in tables of their own. An element's attributes are
 * numbered from `attributeOffsets[n]` up to `attributeOffsets[n + 1]`; namespace declarations are
 * sorted by element. Comments and processing instructions keep their content in a map, as they are few.
 *
 * The arrays are for code that navigates the tree, such as the axes; they must not be changed.
 * They may be longer than the tree needs: `size` and `attributeCount` say how much is in use.
 */
export class Tree {
  /** The order this tree was made in, among all trees, which orders nodes of different trees. */
  readonly number: number;
  /** The names of the tree's elements, attributes and processing instructions. */
  readonly names: NameTable;
  /** How many nodes the tree has, besides attributes and namespaces. */
  readonly size: number;
  /** How many attributes the tree has. */
  readonly attributeCount: number;
  /** Each node's kind. */
  readonly kinds: Uint8Array;
  /** Each node's parent, or NO_NODE for a root. */
  readonly parents: Int32Array;
  /** The first node after each node's subtree. */
  readonly ends: Int32Array;
  /** The name code of each element and processing instruction, NO_NAME for other nodes. */
  readonly nameCodes: Int32Array;
  /** How much of `text` comes before each node, with one more entry for the end of the tree. */
  readonly textOffsets: Int32Array;
  /** The number of the first attribute of each node, with one more entry for the end of the tree. */
  readonly attributeOffsets: Int32Array;
  /** The text of every text node, in document order. */
  readonly text: string;
  /** The content of each comment and the data of each processing instruction, by node. */
  readonly contents: ReadonlyMap<number, string>;
  /** Each attribute's element. */
  readonly attributeOwners: Int32Array;
  /** Each attribute's name code. */
  readonly attributeNames: Int32Array;
  /** Each attribute's value, normalized as the DTD's type asks. */
  readonly attributeValues: readonly string[];
  /** Each attribute's AttributeFlag bits. */
  readonly attributeFlags: Uint8Array;
  /** The element each namespace declaration is on, in ascending order. */
  readonly namespaceOwners: Int32Array;
  /** Each declaration's prefix, `''` for the default namespace. */
  readonly namespacePrefixes: readonly string[];
  /** Each declaration's URI, `''` where it undeclares a prefix or the default namespace. */
  readonly namespaceURIs: readonly string[];
  /** The URI the document was read from, if known. */
  readonly documentURI: string | null;
  /** The base URI of each node that has one of its own: an element at the top of an external entity, or the document. */
  readonly baseURIs: ReadonlyMap<number, string>;
  /** The DTD's unparsed entities by name. */
  readonly unparsedEntities: ReadonlyMap<string, UnparsedEntity>;
  /** The element each ID belongs to, collected when first asked for. */
  #ids: Map<string, number> | undefined;

  constructor(parts: TreeParts) {
    this.number = nextTreeNumber++;
    this.names = parts.names;
    this.size = parts.size;
    this.attributeCount = parts.attributeCount;
    this.kinds = parts.kinds;
    this.parents = parts.parents;
    this.ends = parts.ends;
    this.nameCodes = parts.nameCodes;
    this.textOffsets = parts.textOffsets;
    this.attributeOffsets = parts.attributeOffsets;
    this.text = parts.text;
    this.contents = parts.contents;
    this.attributeOwners = parts.attributeOwners;
    this.attributeNames = parts.attributeNames;
    this.attributeValues = parts.attributeValues;
    this.attributeFlags = parts.attributeFlags;
    this.namespaceOwners = parts.namespaceOwners;
    this.namespacePrefixes = parts.namespacePrefixes;
    this.namespaceURIs = parts.namespaceURIs;
    this.documentURI = parts.documentURI;
    this.baseURIs = parts.baseURIs;
    this.unparsedEntities = parts.unparsedEntities;
  }

  /** A node's kind. */
  kind(node: number): NodeKind {
    return this.kinds[node] as NodeKind;
  }

  /** A node's parent, or NO_NODE for a root. */
  parent(node: number): number {
    return this.parents[node] as number;
  }

  /** The root of a node's tree: the document node, or a parentless element. */
  root(node: number): number {
    let root = node;
    for (let parent = this.parent(root); parent !== NO_NODE; parent = this.parent(root)) root = parent;
    return root;
  }

  /** The first node after a node's subtree. */
  end(node: number): number {
    return this.ends[node] as number;
  }

  /** A node's first child, or NO_NODE. */
  firstChild(node: number): number {
    const child = node + 1;
    return child < this.end(node) ? child : NO_NODE;
  }

  /** A node's last child, or NO_NODE. */
  lastChild(node: number): number {
    let last = NO_NODE;
    for (let child = this.firstChild(node); child !== NO_NODE; child = this.nextSibling(child)) last = child;
    return last;
  }

  /** A node's next sibling, or NO_NODE. */
  nextSibling(node: number): number {
    const parent = this.parent(node);
    if (parent === NO_NODE) return NO_NODE;
    const next = this.end(node);
    return next < this.end(parent) ? next : NO_NODE;
  }

  /** A node's previous sibling, or NO_NODE; found by walking forward from the first sibling. */
  previousSibling(node: number): number {
    const parent = this.parent(node);
    if (parent === NO_NODE || parent + 1 === node) return NO_NODE;
    let sibling = parent + 1;
    for (let next = this.end(sibling); next !== node; next = this.end(sibling)) sibling = next;
    return sibling;
  }

  /** How many ancestors a node has. */
  depth(node: number): number {
    let depth = 0;
    for (let parent = this.parent(node); parent !== NO_NODE; parent = this.parent(parent)) depth++;
    return depth;
  }

  /** Whether `node` is a descendant of `ancestor`. */
  isDescendant(node: number, ancestor: number): boolean {
    return ancestor < node && node < this.end(ancestor);
  }

  /** The name code of an element or processing instruction, NO_NAME for other nodes. */
  nameCode(node: number): number {
    return this.nameCodes[node] as number;
  }

  /** The name of an element or processing instruction, or null. */
  qName(node: number): QName | null {
    const code = this.nameCode(node);
    return code === NO_NAME ? null : this.names.qName(code);
  }

  /** `dm:string-value`: the text inside a document, element or text node, or a comment's or instruction's content. */
  stringValue(node: number): string {
    const kind = this.kinds[node];
    if (kind === COMMENT || kind === PROCESSING_INSTRUCTION) return this.contents.get(node) as string;
    return this.text.slice(this.textOffsets[node], this.textOffsets[this.end(node)]);
  }

  /** The number of an element's first attribute; for other nodes it equals attributeLimit(node). */
  firstAttribute(node: number): number {
    return this.attributeOffsets[node] as number;
  }

  /** The number after an element's last attribute. */
  attributeLimit(node: number): number {
    return this.attributeOffsets[node + 1] as number;
  }

  /** The number of an element's attribute with an expanded-name id, or NO_NODE. */
  findAttribute(node: number, expandedName: number): number {
    const expanded = this.names.expandedNames;
    const limit = this.attributeLimit(node);
    for (let attribute = this.firstAttribute(node); attribute < limit; attribute++) {
      if (expanded[this.attributeNames[attribute] as number] === expandedName) return attribute;
    }
    return NO_NODE;
  }

  /** An attribute's element. */
  attributeOwner(attribute: number): number {
    return this.attributeOwners[attribute] as number;
  }

  /** An attribute's name. */
  attributeName(attribute: number): QName {
    return this.names.qName(this.attributeNames[attribute] as number);
  }

  /** An attribute's value. */
  attributeValue(attribute: number): string {
    return this.attributeValues[attribute] as string;
  }

  /** Whether an attribute has an AttributeFlag. */
  hasAttributeFlag(attribute: number, flag: number): boolean {
    return ((this.attributeFlags[attribute] as number) & flag) !== 0;
  }

  /** The number of the first namespace declaration on an element or after it. */
  firstDeclaration(node: number): number {
    // Binary search: declarations are sorted by element.
    const owners = this.namespaceOwners;
    let low = 0;
    let high = owners.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((owners[middle] as number) < node) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  /** The element with an ID, as `fn:id` finds it, or NO_NODE; the first such element when several share it. */
  elementById(id: string): number {
    this.#ids ??= this.#collectIds();
    return this.#ids.get(id) ?? NO_NODE;
  }

  /** Every ID in the tree, with the first element it belongs to. */
  #collectIds(): Map<string, number> {
    const ids = new Map<string, number>();
    for (let attribute = 0; attribute < this.attributeCount; attribute++) {
      if (!this.hasAttributeFlag(attribute, AttributeFlag.ID)) continue;
      const value = this.attributeValue(attribute);
      if (!ids.has(value)) ids.set(value, this.attributeOwner(attribute));
    }
    return ids;
  }
}
