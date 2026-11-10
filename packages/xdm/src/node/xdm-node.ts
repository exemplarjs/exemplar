import { QName } from '@exemplarjs/xml';
import { ANY_NODE, Axis, type NodeName, type NodeTest } from '@/axes/axis';
import { NO_NAME } from '@/names/name-table';
import { kindName, NodeKind } from '@/node-kind';
import { baseURI } from '@/tree/base-uri';
import type { NamespaceBinding } from '@/tree/namespaces';
import { AttributeFlag, NO_NODE, type Tree } from '@/tree/tree';
import { XS_NAMESPACE } from '@/types/built-in-types';
import { nodeListOnAxis, nodesOnAxis } from './node-axes.ts';
import { compareOrder, ownerOf } from './order.ts';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { ATTRIBUTE, DOCUMENT, ELEMENT, NAMESPACE, TEXT } = NodeKind;

const UNTYPED = new QName(XS_NAMESPACE, 'untyped', 'xs');
const UNTYPED_ATOMIC = new QName(XS_NAMESPACE, 'untypedAtomic', 'xs');

/**
 * A node of a Tree, with the XDM accessors: `nodeName`, `stringValue`, `parent`, `baseURI` and the
 * rest, as the data model defines them.
 *
 * ```ts
 * const document = new XdmDocumentBuilder().parse('<list><item id="a">one</item></list>');
 * const item = document.elementById('a');
 * item?.stringValue; // 'one'
 * item?.parent?.nodeName?.localName; // 'list'
 * ```
 *
 * A node is a small view of a tree: a kind, a number in the tree, and for a namespace node its
 * binding. Two views of one node are different objects, so compare nodes with `isSameNode`.
 * Elements, text, comments, processing instructions and documents are numbered in the tree's
 * node arrays, attributes in its attribute table, and a namespace node by its element.
 */
export class XdmNode {
  readonly tree: Tree;
  readonly kind: NodeKind;
  /** The node's number: in the tree's node arrays, its attribute table for an attribute, or its element's for a namespace. */
  readonly index: number;
  /** A namespace node's prefix and URI; null for other kinds. */
  readonly binding: NamespaceBinding | null;

  constructor(tree: Tree, kind: NodeKind, index: number, binding: NamespaceBinding | null = null) {
    this.tree = tree;
    this.kind = kind;
    this.index = index;
    this.binding = binding;
  }

  /** A view of a node in a tree's node arrays. */
  static of(tree: Tree, node: number): XdmNode {
    return new XdmNode(tree, tree.kind(node), node);
  }

  /** `dm:node-kind`: `element`, `attribute`, `text` and so on. */
  get kindName(): string {
    return kindName(this.kind);
  }

  /** `dm:node-name`: the name of an element, attribute, processing instruction or prefixed namespace node, else null. */
  get nodeName(): QName | null {
    switch (this.kind) {
      case ATTRIBUTE: {
        return this.tree.attributeName(this.index);
      }
      case NAMESPACE: {
        const prefix = (this.binding as NamespaceBinding).prefix;
        return prefix === '' ? null : new QName('', prefix);
      }
      default: {
        return this.tree.qName(this.index);
      }
    }
  }

  /** The local part of the node's name, or `''` for a node without one. */
  get localName(): string {
    return this.nodeName?.localName ?? '';
  }

  /** The namespace URI of the node's name, or `''`. */
  get namespaceURI(): string {
    return this.nodeName?.namespaceURI ?? '';
  }

  /** `dm:string-value`. */
  get stringValue(): string {
    switch (this.kind) {
      case ATTRIBUTE: {
        return this.tree.attributeValue(this.index);
      }
      case NAMESPACE: {
        return (this.binding as NamespaceBinding).uri;
      }
      default: {
        return this.tree.stringValue(this.index);
      }
    }
  }

  /** `dm:parent`: the element of an attribute or namespace node, otherwise the parent, or null for a root. */
  get parent(): XdmNode | null {
    if (this.kind === ATTRIBUTE || this.kind === NAMESPACE) return XdmNode.of(this.tree, ownerOf(this));
    const parent = this.tree.parent(this.index);
    return parent === NO_NODE ? null : XdmNode.of(this.tree, parent);
  }

  /** The root of the node's tree, as `fn:root` finds it: usually its document node. */
  get root(): XdmNode {
    return XdmNode.of(this.tree, this.tree.root(ownerOf(this)));
  }

  /** `dm:base-uri`, as XML Base gives it; null for a namespace node, or when none is known. */
  get baseURI(): string | null {
    return this.kind === NAMESPACE ? null : baseURI(this.tree, ownerOf(this));
  }

  /** `dm:document-uri`: the URI a document node was read from, null for other nodes. */
  get documentURI(): string | null {
    return this.kind === DOCUMENT ? this.tree.documentURI : null;
  }

  /** `dm:is-id`: whether an attribute is an ID, declared in the DTD or as `xml:id`. */
  get isId(): boolean {
    return this.kind === ATTRIBUTE && this.tree.hasAttributeFlag(this.index, AttributeFlag.ID);
  }

  /** `dm:is-idrefs`: whether the DTD declares an attribute IDREF or IDREFS. */
  get isIdrefs(): boolean {
    return this.kind === ATTRIBUTE && this.tree.hasAttributeFlag(this.index, AttributeFlag.IDREFS);
  }

  /** `dm:nilled`: false for an element, as untyped elements are never nilled; null for other nodes. */
  get nilled(): boolean | null {
    return this.kind === ELEMENT ? false : null;
  }

  /** `dm:type-name`: `xs:untyped` for elements, `xs:untypedAtomic` for attributes and text, otherwise null. */
  get typeName(): QName | null {
    if (this.kind === ELEMENT) return UNTYPED;
    if (this.kind === ATTRIBUTE || this.kind === TEXT) return UNTYPED_ATOMIC;
    return null;
  }

  /**
   * The nodes on an axis, in its order, that pass a test. A name keeps the elements of that name,
   * or on the attribute axis the attributes: `node.axis(Axis.CHILD, 'title')`.
   */
  axis(axis: Axis, test: NodeTest | NodeName | string = ANY_NODE): Iterable<XdmNode> {
    return nodesOnAxis(this, axis, this.#testFor(axis, test));
  }

  /** The node test for a name on an axis, whose kind is the axis's own: attributes on the attribute axis, else elements. */
  #testFor(axis: Axis, test: NodeTest | NodeName | string): NodeTest {
    if (typeof test !== 'string' && 'kind' in test) return test;
    const { localName, namespaceURI = '' } = typeof test === 'string' ? { localName: test } : test;
    const kind = axis === Axis.ATTRIBUTE ? ATTRIBUTE : ELEMENT;
    return { kind, name: this.tree.names.lookup(namespaceURI, localName) };
  }

  /** `dm:children`: the node's children in document order. */
  children(): XdmNode[] {
    return nodeListOnAxis(this, Axis.CHILD, ANY_NODE);
  }

  /** `dm:attributes`: an element's attributes, without namespace declarations. */
  attributes(): XdmNode[] {
    return nodeListOnAxis(this, Axis.ATTRIBUTE, ANY_NODE);
  }

  /** The value of an element's attribute with a local name and, when it has one, a namespace URI; undefined when there is none. */
  attribute(localName: string, namespaceURI = ''): string | undefined {
    if (this.kind !== ELEMENT) return undefined;
    const name = this.tree.names.lookup(namespaceURI, localName);
    const attribute = name === NO_NAME ? NO_NODE : this.tree.findAttribute(this.index, name);
    return attribute === NO_NODE ? undefined : this.tree.attributeValue(attribute);
  }

  /** `dm:namespace-nodes`: an element's namespace nodes, one per namespace in scope, `xml` first. */
  namespaceNodes(): XdmNode[] {
    return nodeListOnAxis(this, Axis.NAMESPACE, ANY_NODE);
  }

  /** The element in this node's document with an ID, as `fn:element-with-id` finds it, or null. */
  elementById(id: string): XdmNode | null {
    const element = this.tree.elementById(id);
    return element === NO_NODE ? null : XdmNode.of(this.tree, element);
  }

  /** `dm:unparsed-entity-system-id` of the node's document, or null when the DTD declares no such unparsed entity. */
  unparsedEntitySystemId(name: string): string | null {
    return this.tree.unparsedEntities.get(name)?.systemId ?? null;
  }

  /** `dm:unparsed-entity-public-id` of the node's document, or null when the entity is unknown or has none. */
  unparsedEntityPublicId(name: string): string | null {
    return this.tree.unparsedEntities.get(name)?.publicId || null;
  }

  /** Whether another view is of the same node. */
  isSameNode(other: XdmNode): boolean {
    return compareOrder(this, other) === 0;
  }

  /** Negative, zero or positive as this node comes before, is, or comes after another in document order. */
  compareOrder(other: XdmNode): number {
    return compareOrder(this, other);
  }
}
