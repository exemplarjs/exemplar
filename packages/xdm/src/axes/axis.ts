import { ANY_NAME, NO_NAME, SEVERAL_CODES } from '@/names/name-table';
import { NodeKind } from '@/node-kind';
import { NO_NODE, type Tree } from '@/tree/tree';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { ELEMENT, PROCESSING_INSTRUCTION } = NodeKind;

/** The XPath axes. */
export const Axis = {
  ANCESTOR: 'ancestor',
  ANCESTOR_OR_SELF: 'ancestor-or-self',
  ATTRIBUTE: 'attribute',
  CHILD: 'child',
  DESCENDANT: 'descendant',
  DESCENDANT_OR_SELF: 'descendant-or-self',
  FOLLOWING: 'following',
  FOLLOWING_SIBLING: 'following-sibling',
  NAMESPACE: 'namespace',
  PARENT: 'parent',
  PRECEDING: 'preceding',
  PRECEDING_SIBLING: 'preceding-sibling',
  SELF: 'self',
} as const;

export type Axis = (typeof Axis)[keyof typeof Axis];

/** A NodeTest kind that matches nodes of every kind. */
export const ANY_KIND = 0;

export { ANY_NAME } from '@/names/name-table';

/**
 * Which nodes a step keeps: a kind, or ANY_KIND, and an expanded-name id from the tree's
 * NameTable, or ANY_NAME. A name the tree does not hold (NO_NAME) matches nothing.
 */
export interface NodeTest {
  readonly kind: number;
  readonly name: number;
}

/** A node's name for `XdmNode.axis`: its local name and, when it has one, its namespace URI. */
export interface NodeName {
  readonly localName: string;
  readonly namespaceURI?: string;
}

/** The test that keeps every node, as `node()` does. */
export const ANY_NODE: NodeTest = { kind: ANY_KIND, name: ANY_NAME };

/** Steps through the nodes of an axis by node number; `next()` returns NO_NODE once they run out. */
export interface NodeIterator {
  next(): number;
}

/** Whether a tree node passes a test. */
export function passes(tree: Tree, node: number, test: NodeTest): boolean {
  const kind = tree.kinds[node] as number;
  if (test.kind !== ANY_KIND && kind !== test.kind) return false;
  if (test.name === ANY_NAME) return true;
  if (kind !== ELEMENT && kind !== PROCESSING_INSTRUCTION) return false;
  return tree.names.expandedNames[tree.nameCodes[node] as number] === test.name;
}

/**
 * Nodes from `start` up to `limit` in document order, stepping over subtrees when `siblings`. A
 * name only one code has is matched by comparing codes; otherwise by expanded name.
 */
class ForwardIterator implements NodeIterator {
  readonly #tree: Tree;
  readonly #test: NodeTest;
  readonly #limit: number;
  readonly #siblings: boolean;
  /** The kind to keep, or ANY_KIND. */
  readonly #kind: number;
  /** The name code to keep, ANY_NAME, or SEVERAL_CODES to compare expanded names. */
  readonly #code: number;
  #next: number;

  constructor(tree: Tree, start: number, limit: number, siblings: boolean, test: NodeTest) {
    this.#tree = tree;
    this.#test = test;
    this.#limit = limit;
    this.#siblings = siblings;
    this.#kind = test.kind;
    this.#code = test.name === ANY_NAME ? ANY_NAME : tree.names.singleCode(test.name);
    this.#next = start;
  }

  next(): number {
    const tree = this.#tree;
    const { ends, kinds, nameCodes } = tree;
    const kind = this.#kind;
    const code = this.#code;
    while (this.#next < this.#limit) {
      const node = this.#next;
      this.#next = this.#siblings ? (ends[node] as number) : node + 1;
      if (kind !== ANY_KIND && kinds[node] !== kind) continue;
      if (code === ANY_NAME || nameCodes[node] === code) return node;
      if (code === SEVERAL_CODES && passes(tree, node, this.#test)) return node;
    }
    return NO_NODE;
  }
}

/** Nodes from a list, last first. */
class ReverseListIterator implements NodeIterator {
  readonly #nodes: readonly number[];
  #index: number;

  constructor(nodes: readonly number[]) {
    this.#nodes = nodes;
    this.#index = nodes.length;
  }

  next(): number {
    return this.#index > 0 ? (this.#nodes[--this.#index] as number) : NO_NODE;
  }
}

/** The node itself when `self`, then its ancestors, nearest first. */
class AncestorIterator implements NodeIterator {
  readonly #tree: Tree;
  readonly #test: NodeTest;
  #next: number;

  constructor(tree: Tree, node: number, self: boolean, test: NodeTest) {
    this.#tree = tree;
    this.#test = test;
    this.#next = self ? node : tree.parent(node);
  }

  next(): number {
    const tree = this.#tree;
    while (this.#next !== NO_NODE) {
      const node = this.#next;
      this.#next = tree.parent(node);
      if (passes(tree, node, this.#test)) return node;
    }
    return NO_NODE;
  }
}

/** The nodes before a node that are not its ancestors, nearest first. */
class PrecedingIterator implements NodeIterator {
  readonly #tree: Tree;
  readonly #test: NodeTest;
  #next: number;
  /** The nearest ancestor not yet passed, which the axis leaves out. */
  #ancestor: number;

  constructor(tree: Tree, node: number, test: NodeTest) {
    this.#tree = tree;
    this.#test = test;
    this.#next = node - 1;
    this.#ancestor = tree.parent(node);
  }

  next(): number {
    const tree = this.#tree;
    while (this.#next >= 0) {
      const node = this.#next--;
      if (node === this.#ancestor) {
        this.#ancestor = tree.parent(node);
        continue;
      }
      if (passes(tree, node, this.#test)) return node;
    }
    return NO_NODE;
  }
}

/** The empty axis. */
const NOTHING: NodeIterator = { next: () => NO_NODE };

/**
 * The node numbers on an axis from a tree node: document order for forward axes, nearest first for
 * reverse ones. Attributes and namespaces are numbered in tables of their own, so those axes give none.
 */
export function axisIterator(tree: Tree, node: number, axis: Axis, test: NodeTest = ANY_NODE): NodeIterator {
  if (test.name === NO_NAME) return NOTHING;
  switch (axis) {
    case Axis.CHILD: {
      return new ForwardIterator(tree, node + 1, tree.end(node), true, test);
    }
    case Axis.DESCENDANT: {
      return new ForwardIterator(tree, node + 1, tree.end(node), false, test);
    }
    case Axis.DESCENDANT_OR_SELF: {
      return new ForwardIterator(tree, node, tree.end(node), false, test);
    }
    case Axis.SELF: {
      return new ForwardIterator(tree, node, node + 1, false, test);
    }
    case Axis.PARENT: {
      const parent = tree.parent(node);
      return parent === NO_NODE ? NOTHING : new ForwardIterator(tree, parent, parent + 1, false, test);
    }
    case Axis.ANCESTOR: {
      return new AncestorIterator(tree, node, false, test);
    }
    case Axis.ANCESTOR_OR_SELF: {
      return new AncestorIterator(tree, node, true, test);
    }
    case Axis.FOLLOWING_SIBLING: {
      return followingSiblings(tree, node, test);
    }
    case Axis.PRECEDING_SIBLING: {
      return precedingSiblings(tree, node, test);
    }
    case Axis.FOLLOWING: {
      return new ForwardIterator(tree, tree.end(node), tree.size, false, test);
    }
    case Axis.PRECEDING: {
      return new PrecedingIterator(tree, node, test);
    }
    default: {
      return NOTHING;
    }
  }
}

/** The nodes after a node in document order, its descendants first: the following axis of its attributes. */
export function nodesAfter(tree: Tree, node: number, test: NodeTest = ANY_NODE): NodeIterator {
  return new ForwardIterator(tree, node + 1, tree.size, false, test);
}

/** A node's following siblings; a root has none. */
function followingSiblings(tree: Tree, node: number, test: NodeTest): NodeIterator {
  const parent = tree.parent(node);
  return parent === NO_NODE ? NOTHING : new ForwardIterator(tree, tree.end(node), tree.end(parent), true, test);
}

/** A node's preceding siblings, nearest first, gathered from the first sibling forward. */
function precedingSiblings(tree: Tree, node: number, test: NodeTest): NodeIterator {
  const parent = tree.parent(node);
  if (parent === NO_NODE) return NOTHING;
  const siblings: number[] = [];
  for (let sibling = parent + 1; sibling < node; sibling = tree.end(sibling)) {
    if (passes(tree, sibling, test)) siblings.push(sibling);
  }
  return new ReverseListIterator(siblings);
}

/** Whether an attribute passes a test: the attribute axis's principal kind is attribute. */
export function attributePasses(tree: Tree, attribute: number, test: NodeTest): boolean {
  if (test.kind !== ANY_KIND && test.kind !== NodeKind.ATTRIBUTE) return false;
  return test.name === ANY_NAME || tree.names.expandedNames[tree.attributeNames[attribute] as number] === test.name;
}
