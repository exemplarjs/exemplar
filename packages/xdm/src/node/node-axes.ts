import {
  ANY_KIND,
  ANY_NAME,
  attributePasses,
  Axis,
  axisIterator,
  type NodeIterator,
  passes as treeNodePasses,
  nodesAfter,
  type NodeTest,
} from '@/axes/axis';
import { NO_NAME } from '@/names/name-table';
import { NodeKind } from '@/node-kind';
import { inScopeNamespaces, type NamespaceBinding } from '@/tree/namespaces';
import { NO_NODE, type Tree } from '@/tree/tree';
import { ownerOf } from './order.ts';
import { XdmNode } from './xdm-node.ts';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { ATTRIBUTE, ELEMENT, NAMESPACE } = NodeKind;

/** XdmNodes for the node numbers an iterator gives. */
class Nodes implements IterableIterator<XdmNode> {
  readonly #tree: Tree;
  readonly #nodes: NodeIterator;

  constructor(tree: Tree, nodes: NodeIterator) {
    this.#tree = tree;
    this.#nodes = nodes;
  }

  next(): IteratorResult<XdmNode> {
    const node = this.#nodes.next();
    return node === NO_NODE ? { done: true, value: undefined } : { done: false, value: XdmNode.of(this.#tree, node) };
  }

  [Symbol.iterator](): IterableIterator<XdmNode> {
    return this;
  }
}

/**
 * The nodes on an axis from any node, in the axis's order. From an attribute or namespace node they
 * run from its element: its ancestors start with the element, its following nodes with the element's children.
 */
export function nodesOnAxis(node: XdmNode, axis: Axis, test: NodeTest): Iterable<XdmNode> {
  const tree = node.tree;
  if (axis === Axis.ATTRIBUTE) return node.kind === ELEMENT ? attributes(tree, node.index, test) : [];
  if (axis === Axis.NAMESPACE) return node.kind === ELEMENT ? namespaces(tree, node.index, test) : [];
  if (node.kind !== ATTRIBUTE && node.kind !== NAMESPACE)
    return new Nodes(tree, axisIterator(tree, node.index, axis, test));
  return fromAttachedNode(node, axis, test);
}

/** The nodes on an axis from any node that pass a test, as `nodesOnAxis` gives them, in a list. */
export function nodeListOnAxis(node: XdmNode, axis: Axis, test: NodeTest): XdmNode[] {
  // The attribute and namespace axes already build a fresh array.
  if (axis === Axis.ATTRIBUTE || axis === Axis.NAMESPACE) return nodesOnAxis(node, axis, test) as XdmNode[];
  if (node.kind === ATTRIBUTE || node.kind === NAMESPACE) return [...nodesOnAxis(node, axis, test)];
  const tree = node.tree;
  if (axis === Axis.SELF || axis === Axis.PARENT) {
    // Each gives at most one node, tested without an iterator.
    const one = axis === Axis.SELF ? node.index : tree.parent(node.index);
    if (one === NO_NODE || test.name === NO_NAME || !treeNodePasses(tree, one, test)) return [];
    return [one === node.index ? node : XdmNode.of(tree, one)];
  }
  // Read straight from the tree's iterator, without an iterator result for each node.
  const found: XdmNode[] = [];
  const nodes = axisIterator(tree, node.index, axis, test);
  for (let next = nodes.next(); next !== NO_NODE; next = nodes.next()) found.push(XdmNode.of(tree, next));
  return found;
}

/** The axes from an attribute or namespace node. */
function fromAttachedNode(node: XdmNode, axis: Axis, test: NodeTest): Iterable<XdmNode> {
  const tree = node.tree;
  const element = ownerOf(node);
  switch (axis) {
    case Axis.SELF:
    case Axis.DESCENDANT_OR_SELF: {
      return passes(node, test) ? [node] : [];
    }
    case Axis.PARENT: {
      return new Nodes(tree, axisIterator(tree, element, Axis.SELF, test));
    }
    case Axis.ANCESTOR_OR_SELF: {
      const self = passes(node, test) ? [node] : [];
      return [...self, ...new Nodes(tree, axisIterator(tree, element, Axis.ANCESTOR_OR_SELF, test))];
    }
    case Axis.ANCESTOR: {
      return new Nodes(tree, axisIterator(tree, element, Axis.ANCESTOR_OR_SELF, test));
    }
    case Axis.FOLLOWING: {
      return new Nodes(tree, nodesAfter(tree, element, test));
    }
    case Axis.PRECEDING: {
      return new Nodes(tree, axisIterator(tree, element, Axis.PRECEDING, test));
    }
    default: {
      return [];
    }
  }
}

/** Whether an attribute or namespace node passes a test, as the self axis asks. */
function passes(node: XdmNode, test: NodeTest): boolean {
  if (node.kind === ATTRIBUTE) return attributePasses(node.tree, node.index, test);
  if (test.kind !== ANY_KIND && test.kind !== NAMESPACE) return false;
  return test.name === ANY_NAME || namespaceNamed(node, test.name);
}

/** Whether a namespace node's prefix has an expanded-name id. */
function namespaceNamed(node: XdmNode, name: number): boolean {
  const prefix = (node.binding as NamespaceBinding).prefix;
  return name !== NO_NAME && prefix !== '' && node.tree.names.lookup('', prefix) === name;
}

/** An element's attributes that pass a test. */
function attributes(tree: Tree, element: number, test: NodeTest): XdmNode[] {
  const found: XdmNode[] = [];
  const limit = tree.attributeLimit(element);
  for (let attribute = tree.firstAttribute(element); attribute < limit; attribute++) {
    if (attributePasses(tree, attribute, test)) found.push(new XdmNode(tree, ATTRIBUTE, attribute));
  }
  return found;
}

/** An element's namespace nodes that pass a test. */
function namespaces(tree: Tree, element: number, test: NodeTest): XdmNode[] {
  return inScopeNamespaces(tree, element)
    .map((binding) => new XdmNode(tree, NAMESPACE, element, binding))
    .filter((node) => passes(node, test));
}
