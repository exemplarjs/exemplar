import {
  axisIterator,
  isNode,
  NO_NODE,
  type NodeIterator,
  NodeKind,
  type NodeTest,
  type Tree,
  XdmNode,
  type XdmValue,
} from '@exemplarjs/xdm';
import { treeNodePasses } from '@exemplarjs/xdm/internal';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { allItems, ArrayStream, type ItemStream } from '@/runtime/item-streams';
import { AttributeStream, NumberStream } from '@/runtime/node-streams';
import type { AxisName, Expression } from '@/syntax/syntax-tree';
import {
  checkedStream,
  checksOf,
  type NodeChecks,
  type StepStreamer,
  nthPassingNumber,
  passesChecks,
  REVERSE_AXES,
  type StepParts,
  stepStreamer,
} from './compile-steps.ts';
import type { CompileState } from './compiler.ts';
import { isAnyDescendantOrSelf, isPositionFree, literalPosition } from './predicate-analysis.ts';

/**
 * A step of a path run on numbers. `readsSubtrees` marks a step after `//` that reads each node's
 * whole subtree at once: `//@a`, the run of attribute numbers the subtree holds, and `//x[n]`, the
 * nth `x` child of every node in it, found in one walk of its descendants.
 */
interface NumberStep {
  readonly parts: StepParts;
  readonly readsSubtrees: boolean;
}

/**
 * A path whose steps after the first are axis steps, run on node numbers: each step's nodes are
 * found by number from the numbers before, put in document order by sorting the numbers, and only
 * the last step's nodes are made, as they are read.
 */
export interface NumberPath {
  readonly steps: readonly NumberStep[];
  readonly lastStep: NumberStep;
  /** The maker of the last step's stream from one node, made once, for a last step that streams lazily. */
  readonly lastStepStreamer: StepStreamer | undefined;
}

/** What a path does with the first step's value when it is not tree nodes of one tree: the steps run node by node. */
export type StepsByNode = (value: XdmValue, context: DynamicContext) => XdmValue;

/** The axes that, from nodes in document order, give theirs in document order or nearly so. */
const ORDER_KEEPING_AXES: ReadonlySet<AxisName> = new Set(['child', 'self', 'attribute']);

/** Whether a step's predicates suit numbers: none, conditions that read no position, or one literal position off the attribute axis. */
function predicatesFitNumbers(step: Expression & { kind: 'axis-step' }, state: CompileState): boolean {
  const { predicates } = step;
  if (predicates.length === 0) return true;
  const only = predicates.length === 1 ? (predicates[0] as Expression) : undefined;
  if (only !== undefined && literalPosition(only) !== undefined) return step.axis !== 'attribute';
  return predicates.every((predicate) => isPositionFree(predicate, state));
}

/** Whether a path's steps, `//` already rewritten, can run on node numbers, judged from their syntax alone. */
export function pathFitsNumbers(steps: readonly Expression[], state: CompileState): boolean {
  // A first step and at least one more.
  if (steps.length <= 1) return false;
  for (let index = 1; index < steps.length; index++) {
    const step = steps[index] as Expression;
    if (step.kind !== 'axis-step' || step.axis === 'namespace') return false;
    if (step.axis === 'attribute' && index < steps.length - 1) return false;
    if (!predicatesFitNumbers(step, state)) return false;
  }
  return true;
}

/** Whether compiled parts run on numbers: predicates as conditions that cannot pause, or a lone position. */
function partsFitNumbers(parts: StepParts): boolean {
  return parts.position === undefined ? parts.conditions !== undefined : parts.predicates.length === 0;
}

/** A path run on numbers from the compiled parts of its steps after the first, or undefined when one does not fit. */
export function numberPathOf(steps: readonly Expression[], parts: readonly StepParts[]): NumberPath | undefined {
  if (!parts.every((step) => partsFitNumbers(step))) return undefined;
  const numberSteps: NumberStep[] = [];
  for (const [index, step] of parts.entries()) {
    // `//@a` and `//x[n]` read the subtree of each node before `//`, which is the step before them.
    const readsSubtree = step.axis === 'attribute' || (step.axis === 'child' && step.position !== undefined);
    if (readsSubtree && index > 0 && isAnyDescendantOrSelf(steps[index])) {
      numberSteps[numberSteps.length - 1] = { parts: step, readsSubtrees: true };
    } else numberSteps.push({ parts: step, readsSubtrees: false });
  }
  const lastStep = numberSteps.at(-1) as NumberStep;
  const { axis, position } = lastStep.parts;
  // From one node, a forward step that runs by its conditions streams lazily from it.
  const lazy = axis !== 'attribute' && !REVERSE_AXES.has(axis) && position === undefined;
  const lastStepStreamer = lazy ? stepStreamer(lastStep.parts) : undefined;
  return { steps: numberSteps.slice(0, -1), lastStep, lastStepStreamer };
}

/** Whether a path is quicker evaluated on numbers than node by node: it has steps between, reads subtrees, or its last may give nodes out of order. */
export function paysOnNumbers({ steps, lastStep }: NumberPath): boolean {
  return steps.length > 0 || lastStep.readsSubtrees || !ORDER_KEEPING_AXES.has(lastStep.parts.axis);
}

/** The tree all of a value's items are tree nodes of, or undefined for a value with other items, attributes, or several trees. */
function sharedTree(value: XdmValue): Tree | undefined {
  const first = value[0];
  if (first === undefined || !isNode(first)) return undefined;
  const tree = first.tree;
  for (const item of value) {
    if (!isNode(item) || item.tree !== tree || item.kind === NodeKind.ATTRIBUTE || item.kind === NodeKind.NAMESPACE)
      return undefined;
  }
  return tree;
}

/** Node numbers in document order without duplicates: as they are when already so, else sorted. */
function inNumberOrder(numbers: number[]): number[] {
  for (let index = 1; index < numbers.length; index++) {
    if ((numbers[index] as number) <= (numbers[index - 1] as number)) return sortedDistinct(numbers);
  }
  return numbers;
}

/** Node numbers sorted, each once. */
function sortedDistinct(numbers: readonly number[]): number[] {
  const distinct: number[] = [];
  // eslint-disable-next-line unicorn/no-array-sort -- sorts a fresh typed copy in place
  for (const number of Int32Array.from(numbers).sort()) if (distinct.at(-1) !== number) distinct.push(number);
  return distinct;
}

/** The children of one node after another that pass a test, by number, one cursor moved from node to node. */
class ChildCursor implements NodeIterator {
  readonly #tree: Tree;
  readonly #test: NodeTest;
  #next = 0;
  #limit = 0;

  constructor(tree: Tree, test: NodeTest) {
    this.#tree = tree;
    this.#test = test;
  }

  /** Moves the cursor to a node's children; returns it. */
  childrenOf(node: number): this {
    this.#next = node + 1;
    this.#limit = this.#tree.end(node);
    return this;
  }

  next(): number {
    const tree = this.#tree;
    const ends = tree.ends;
    while (this.#next < this.#limit) {
      const child = this.#next;
      this.#next = ends[child] as number;
      if (treeNodePasses(tree, child, this.#test)) return child;
    }
    return NO_NODE;
  }
}

/** Whether a node number passes a step's checks; a node is made only when there are some. */
function numberPasses(tree: Tree, node: number, checks: NodeChecks, context: DynamicContext): boolean {
  return checks.passesAll || passesChecks(XdmNode.of(tree, node), checks, context);
}

/** The numbers an axis iterator gives that pass a step's checks, added to `found`. */
function addPassingNumbers(
  nodes: NodeIterator,
  tree: Tree,
  checks: NodeChecks,
  context: DynamicContext,
  found: number[]
): void {
  for (let next = nodes.next(); next !== NO_NODE; next = nodes.next()) {
    if (numberPasses(tree, next, checks, context)) found.push(next);
  }
}

/** How many children of each open ancestor a walk in document order has counted, the deepest ancestor last. */
class ChildCounts {
  readonly #parents: number[] = [];
  readonly #counts: number[] = [];

  /** Counts a node as its parent's next child; returns how many of that parent's children are counted. */
  countChild(tree: Tree, node: number): number {
    const parents = this.#parents;
    const counts = this.#counts;
    // Ancestors whose subtrees the walk has left are closed.
    while (parents.length > 0 && tree.end(parents.at(-1) as number) <= node) {
      parents.pop();
      counts.pop();
    }
    const parent = tree.parent(node);
    if (parents.at(-1) !== parent) {
      parents.push(parent);
      counts.push(0);
    }
    const count = (counts.at(-1) as number) + 1;
    counts[counts.length - 1] = count;
    return count;
  }
}

/**
 * `//x[n]` on numbers: the nth child passing a step's checks of each node in the subtrees of nodes,
 * in document order, found in one walk of each subtree's descendants, counting each parent's.
 */
function nthChildrenWithin(tree: Tree, from: readonly number[], parts: StepParts, context: DynamicContext): number[] {
  const position = parts.position as number;
  const test = parts.test.forTree(tree);
  const checks = checksOf(parts, context);
  const counts = new ChildCounts();
  const found: number[] = [];
  for (const node of outermostNodes(tree, from)) {
    const nodes = axisIterator(tree, node, 'descendant', test);
    for (let next = nodes.next(); next !== NO_NODE; next = nodes.next()) {
      if (numberPasses(tree, next, checks, context) && counts.countChild(tree, next) === position) found.push(next);
    }
  }
  return found;
}

/** The numbers of a step's nodes from each node in turn, in document order without duplicates. */
function numbersOnStep(tree: Tree, from: readonly number[], step: NumberStep, context: DynamicContext): number[] {
  const { parts } = step;
  const { axis, position } = parts;
  // A position before the first holds no node, and no nodes have none.
  if ((position !== undefined && position < 1) || from.length === 0) return [];
  if (step.readsSubtrees) return nthChildrenWithin(tree, from, parts, context);
  const test = parts.test.forTree(tree);
  const checks = checksOf(parts, context);
  const found: number[] = [];
  // Children are read straight from the tree, by one cursor rather than an iterator for each node.
  const children = axis === 'child' ? new ChildCursor(tree, test) : undefined;
  for (const node of from) {
    const nodes = children === undefined ? axisIterator(tree, node, axis, test) : children.childrenOf(node);
    if (position === undefined) addPassingNumbers(nodes, tree, checks, context, found);
    else {
      const nth = nthPassingNumber(nodes, position, tree, checks, context);
      if (nth !== NO_NODE) found.push(nth);
    }
  }
  return inNumberOrder(found);
}

/** The first step's nodes, tree nodes of one tree, as numbers, through the steps between. */
function numbersBeforeLast(path: NumberPath, tree: Tree, value: XdmValue, context: DynamicContext): number[] {
  let found = inNumberOrder(value.map((item) => (item as XdmNode).index));
  for (const step of path.steps) {
    // No nodes before a step leave none after it.
    if (found.length === 0) break;
    found = numbersOnStep(tree, found, step, context);
  }
  return found;
}

/** The node numbers, in document order, that are not inside the subtree of one before them, whose subtrees hold the rest. */
function outermostNodes(tree: Tree, numbers: readonly number[]): number[] {
  const outer: number[] = [];
  let covered = -1;
  for (const node of numbers) {
    if (node < covered) continue;
    covered = tree.end(node);
    outer.push(node);
  }
  return outer;
}

/** The runs of attribute numbers the last step reads: each node's own, or, within subtrees, each outermost subtree's. */
function attributeRuns(tree: Tree, numbers: readonly number[], readsSubtrees: boolean): number[] {
  const runs: number[] = [];
  if (!readsSubtrees) {
    for (const node of numbers) runs.push(tree.firstAttribute(node), tree.attributeLimit(node));
    return runs;
  }
  for (const node of outermostNodes(tree, numbers))
    runs.push(tree.firstAttribute(node), tree.firstAttribute(tree.end(node)));
  return runs;
}

/** The items of the last step from the numbers before it, as a stream: lazily from one node, else from its sorted numbers. */
function lastStepStream(path: NumberPath, tree: Tree, numbers: readonly number[], context: DynamicContext): ItemStream {
  const { parts: lastParts, readsSubtrees } = path.lastStep;
  const fromNode = path.lastStepStreamer;
  if (fromNode !== undefined && numbers.length === 1) return fromNode(XdmNode.of(tree, numbers[0] as number), context);
  if (lastParts.axis !== 'attribute')
    return new NumberStream(tree, numbersOnStep(tree, numbers, path.lastStep, context));
  const runs = attributeRuns(tree, numbers, readsSubtrees);
  return checkedStream(new AttributeStream(tree, runs, lastParts.test.forTree(tree)), lastParts, context);
}

/** A path's stream on numbers from its first step's value; the steps run node by node when that is not tree nodes of one tree. */
export function numberPathStream(
  path: NumberPath,
  stepsByNode: StepsByNode
): (value: XdmValue, context: DynamicContext) => ItemStream {
  return (value, context) => {
    if (value.length === 0) return new ArrayStream(value);
    const tree = sharedTree(value);
    if (tree === undefined) return new ArrayStream(stepsByNode(value, context));
    // From one node, a last step with a stream of its own reads straight from it.
    const fromNode = path.lastStepStreamer;
    if (fromNode !== undefined && path.steps.length === 0 && value.length === 1)
      return fromNode(value[0] as XdmNode, context);
    return lastStepStream(path, tree, numbersBeforeLast(path, tree, value, context), context);
  };
}

/** A path's nodes on numbers from its first step's value, in a list. */
export function numberPathValue(path: NumberPath, stepsByNode: StepsByNode): StepsByNode {
  const stream = numberPathStream(path, stepsByNode);
  return (value, context) => allItems(stream(value, context));
}
