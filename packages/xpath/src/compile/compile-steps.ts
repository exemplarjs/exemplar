import {
  axisIterator,
  EMPTY_SEQUENCE,
  isNode,
  NO_NODE,
  type NodeIterator,
  NodeKind,
  type NodeTest,
  type Tree,
  XdmNode,
  type XdmValue,
} from '@exemplarjs/xdm';
import { nodeListOnAxis } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { DynamicContext, Evaluator } from '@/runtime/dynamic-context';
import { allItems, ArrayStream, type ItemStream, type Streamer, withStream } from '@/runtime/item-streams';
import { AttributeStream, AxisStream, FilteredStream, NumberStream } from '@/runtime/node-streams';
import { compileNodeTest, type StepTest } from '@/runtime/node-tests';
import { after, anyPausable, type Pausable, pausable } from '@/runtime/pausing';
import type { AxisName, AxisStep } from '@/syntax/syntax-tree';
import {
  type CompiledCondition,
  type CompiledPredicate,
  compileCondition,
  compilePredicate,
  type ConditionTest,
  type FocusTest,
  focusTests,
} from './compile-predicates.ts';
import type { CompileState } from './compiler.ts';
import { isPositionFree, literalPosition } from './predicate-analysis.ts';

/** The axes whose nodes come nearest first, opposite to document order. */
export const REVERSE_AXES: ReadonlySet<AxisName> = new Set([
  'parent',
  'ancestor',
  'ancestor-or-self',
  'preceding',
  'preceding-sibling',
]);

/** The context item as a node; raises XPTY0020 when it is an atomic value. */
export function contextNode(context: DynamicContext): XdmNode {
  const item = context.contextItem();
  if (!isNode(item)) return dynamicError(XPathErrorCode.CONTEXT_NOT_A_NODE, 'The context item of a step is not a node');
  return item;
}

/**
 * An axis step compiled once, so that its evaluator, its stream and a path's node-number pipeline
 * are all made from the same parts: its axis and test, and its predicates in one of three forms.
 * `conditions` holds them as tests when none reads a position or may pause, as in `item[@id]`, or
 * there are none; `position` holds a first predicate that is a literal position, as in `bidder[1]`,
 * which `predicates` then follow; otherwise `predicates` holds every one, in turn.
 */
export interface StepParts {
  readonly axis: AxisName;
  readonly test: StepTest;
  readonly conditions: readonly ConditionTest[] | undefined;
  readonly position: number | undefined;
  readonly predicates: readonly CompiledPredicate[];
}

/** The tests of conditions, or undefined when one may pause. */
function conditionTests(conditions: readonly CompiledCondition[]): ConditionTest[] | undefined {
  const tests: ConditionTest[] = [];
  for (const condition of conditions) {
    if (condition.pauses) return undefined;
    tests.push(condition.test);
  }
  return tests;
}

/** Compiles an axis step's parts. */
export function compileStepParts(step: AxisStep, state: CompileState): StepParts {
  const { axis, predicates } = step;
  const test = compileNodeTest(step.nodeTest, axis, state.context);
  const first = predicates[0];
  const position = first === undefined ? undefined : literalPosition(first);
  if (position !== undefined) {
    const rest = predicates.slice(1).map((predicate) => compilePredicate(predicate, state));
    return { axis, test, conditions: undefined, position, predicates: rest };
  }
  if (predicates.every((predicate) => isPositionFree(predicate, state))) {
    const conditions = predicates.map((predicate) => compileCondition(predicate, state));
    const filters = conditions.map((condition) => condition.predicate);
    return { axis, test, conditions: conditionTests(conditions), position: undefined, predicates: filters };
  }
  const filters = predicates.map((predicate) => compilePredicate(predicate, state));
  return { axis, test, conditions: undefined, position: undefined, predicates: filters };
}

/** Whether an axis from a node walks the tree's node numbers: not from an attribute or namespace node, nor along those axes. */
function walksNodeNumbers(node: XdmNode, axis: AxisName): boolean {
  const fromTreeNode = node.kind !== NodeKind.ATTRIBUTE && node.kind !== NodeKind.NAMESPACE;
  return fromTreeNode && axis !== 'attribute' && axis !== 'namespace';
}

/** The nodes on a step's axis from a node that pass its test, in the axis's order. */
function nodesOnStep(node: XdmNode, axis: AxisName, test: StepTest): XdmNode[] {
  const found = nodeListOnAxis(node, axis, test.forTree(node.tree));
  const refine = test.refine;
  return refine === undefined ? found : found.filter((candidate) => refine(candidate));
}

/** A maker of streams of the nodes on a step's axis from a node that pass its test, before its checks, in document order; its choices made once. */
type AxisStreamer = (node: XdmNode) => ItemStream;

/** A forward axis's stream: lazily along the tree's numbers, or a list from an attribute or namespace node. */
function forwardStreamer(axis: AxisName, test: StepTest): AxisStreamer {
  return (node) => {
    const nodeTest = test.forTree(node.tree);
    if (!walksNodeNumbers(node, axis)) return new ArrayStream(nodeListOnAxis(node, axis, nodeTest));
    return new AxisStream(node.tree, axisIterator(node.tree, node.index, axis, nodeTest));
  };
}

/** A reverse axis's stream, which gives its nodes nearest first: gathered, then read last first. */
function reverseStreamer(axis: AxisName, test: StepTest): AxisStreamer {
  return (node) => {
    const tree = node.tree;
    const nodeTest = test.forTree(tree);
    if (!walksNodeNumbers(node, axis)) return new ArrayStream(nodeListOnAxis(node, axis, nodeTest).toReversed());
    const numbers: number[] = [];
    const nodes = axisIterator(tree, node.index, axis, nodeTest);
    for (let next = nodes.next(); next !== NO_NODE; next = nodes.next()) numbers.push(next);
    return new NumberStream(tree, numbers.toReversed());
  };
}

/** The attribute axis's stream: an element's run of attribute numbers; other nodes have none. */
function attributeStreamer(test: StepTest): AxisStreamer {
  return (node) => (node.kind === NodeKind.ELEMENT ? attributeStreamOf(node, test.forTree(node.tree)) : NO_ITEMS);
}

/** A stream of no items, which never changes. */
const NO_ITEMS: ItemStream = { next: () => undefined, count: () => 0 };

/** The stream maker for a step's axis and test, before the test's refinement. */
function axisStreamer({ axis, test }: StepParts): AxisStreamer {
  if (axis === 'attribute') return attributeStreamer(test);
  return REVERSE_AXES.has(axis) ? reverseStreamer(axis, test) : forwardStreamer(axis, test);
}

/** An element's attributes that pass a test, as a stream over its run of attribute numbers. */
function attributeStreamOf(element: XdmNode, test: NodeTest): AttributeStream {
  const tree = element.tree;
  return new AttributeStream(tree, [tree.firstAttribute(element.index), tree.attributeLimit(element.index)], test);
}

/** What a step asks of each node its axis test lets through: the test's refinement, as `*:title` needs, and its conditions. */
export interface NodeChecks {
  readonly refine: ((node: XdmNode) => boolean) | undefined;
  readonly tests: readonly FocusTest[];
  /** Whether every node passes, there being no checks. */
  readonly passesAll: boolean;
}

/** The checks of a step that has none, shared. */
const NO_CHECKS: NodeChecks = { refine: undefined, tests: [], passesAll: true };

/** Whether a step checks the nodes its axis test lets through. */
function hasChecks(parts: StepParts): boolean {
  return parts.test.refine !== undefined || (parts.conditions?.length ?? 0) > 0;
}

/** A step's checks, its conditions made ready in a focus. */
export function checksOf(parts: StepParts, context: DynamicContext): NodeChecks {
  if (!hasChecks(parts)) return NO_CHECKS;
  return { refine: parts.test.refine, tests: focusTests(parts.conditions, context), passesAll: false };
}

/** Whether a node passes a step's checks, with it as the focus of the conditions. */
export function passesChecks(node: XdmNode, { refine, tests }: NodeChecks, context: DynamicContext): boolean {
  if (refine !== undefined && !refine(node)) return false;
  if (tests.length === 0) return true;
  const focus = context.withFocus(node, 1, 1);
  for (const test of tests) if (!test(focus)) return false;
  return true;
}

/** The number at a position, from 1, among those an axis iterator gives that pass a step's checks, or NO_NODE. */
export function nthPassingNumber(
  nodes: NodeIterator,
  position: number,
  tree: Tree,
  checks: NodeChecks,
  context: DynamicContext
): number {
  let count = 0;
  const passesAll = checks.passesAll;
  for (let next = nodes.next(); next !== NO_NODE; next = nodes.next()) {
    // A node is made only when there are checks.
    if (!passesAll && !passesChecks(XdmNode.of(tree, next), checks, context)) continue;
    count++;
    if (count === position) return next;
  }
  return NO_NODE;
}

/** A step's nodes from a node that pass its checks, made ready in a context, as a stream. */
export type StepStreamer = (node: XdmNode, context: DynamicContext) => ItemStream;

/** The stream of a step's nodes from a node, each checked as the axis reaches it. */
export function stepStreamer(parts: StepParts): StepStreamer {
  const nodes = axisStreamer(parts);
  if (!hasChecks(parts)) return nodes;
  return (node, context) => checkedStream(nodes(node), parts, context);
}

/** A stream's nodes that pass a step's checks, made ready in a context. */
export function checkedStream(stream: ItemStream, parts: StepParts, context: DynamicContext): ItemStream {
  const checks = checksOf(parts, context);
  if (checks.passesAll) return stream;
  return new FilteredStream(stream, (item) => passesChecks(item as XdmNode, checks, context));
}

/** The node at a position, from 1, in a step's axis order, reading no further. */
function nthNodeOnStep(
  node: XdmNode,
  parts: StepParts,
  position: number,
  context: DynamicContext
): XdmNode | undefined {
  const { axis, test } = parts;
  if (position < 1) return undefined;
  if (!walksNodeNumbers(node, axis)) return nodesOnStep(node, axis, test)[position - 1];
  const tree = node.tree;
  const nodes = axisIterator(tree, node.index, axis, test.forTree(tree));
  const nth = nthPassingNumber(nodes, position, tree, checksOf(parts, context), context);
  return nth === NO_NODE ? undefined : XdmNode.of(tree, nth);
}

/** The step's nodes, filtered by its predicates in its axis order, then in document order; pausable when a predicate may pause. */
function filteredStep(parts: StepParts, unfiltered: (context: DynamicContext) => XdmValue): Evaluator {
  const { predicates } = parts;
  const reverse = REVERSE_AXES.has(parts.axis);
  // A reverse axis's predicates see its nodes nearest first.
  const inDocumentOrder = (nodes: XdmValue) => (reverse && nodes.length > 1 ? nodes.toReversed() : nodes);
  if (anyPausable(...predicates))
    return pausable((context) => {
      let nodes: Pausable<XdmValue> = unfiltered(context);
      for (const predicate of predicates) nodes = after(nodes, (value) => predicate(value, context));
      return after(nodes, inDocumentOrder);
    });
  return (context) => {
    let nodes = unfiltered(context);
    for (const predicate of predicates) nodes = predicate(nodes, context);
    return inDocumentOrder(nodes);
  };
}

/** A step's evaluator from its parts, with its stream form when it cannot pause. */
export function stepEvaluator(parts: StepParts): Evaluator {
  const { axis, test, conditions, position } = parts;
  if (position !== undefined)
    return filteredStep(parts, (context) => {
      const found = nthNodeOnStep(contextNode(context), parts, position, context);
      return found === undefined ? EMPTY_SEQUENCE : [found];
    });
  const listed = filteredStep(parts, (context) => nodesOnStep(contextNode(context), axis, test));
  if (conditions === undefined) return listed;
  // Each node is checked as the axis reaches it, so a consumer that needs few reads few; with no checks, the list is quicker.
  const fromNode = stepStreamer(parts);
  const streamer: Streamer = (context) => fromNode(contextNode(context), context);
  const evaluator: Evaluator = conditions.length === 0 ? listed : (context) => allItems(streamer(context));
  return withStream(evaluator, () => streamer);
}

/** An axis step from the context node: its nodes, filtered by its predicates in axis order, then in document order. */
export function compileAxisStep(step: AxisStep, state: CompileState): Evaluator {
  return stepEvaluator(compileStepParts(step, state));
}
