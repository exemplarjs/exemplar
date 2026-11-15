import { ANY_NAME, isNode, NodeKind, type NodeTest, type XdmItem, type XdmNode, type XdmValue } from '@exemplarjs/xdm';
import { nodeListOnAxis } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { inDocumentOrder } from '@/runtime/document-order';
import type { DynamicContext, Evaluator } from '@/runtime/dynamic-context';
import { withStream } from '@/runtime/item-streams';
import { compileNodeTest } from '@/runtime/node-tests';
import { after, anyPausable, joinedInTurn, type Pausable, pausable } from '@/runtime/pausing';
import type { AxisStep, Expression, PathExpression } from '@/syntax/syntax-tree';
import { type CompiledPredicate, compilePredicate } from './compile-predicates.ts';
import { compileAxisStep, compileStepParts, contextNode, type StepParts, stepEvaluator } from './compile-steps.ts';
import { compile, type CompileState } from './compiler.ts';
import { pathFitsNumbers, numberPathOf, numberPathStream, numberPathValue, paysOnNumbers } from './number-paths.ts';
import { isAnyDescendantOrSelf, isPositionFree } from './predicate-analysis.ts';

/** `/`: the root of the context node's tree, which must be a document. */
export function compileRoot(): Evaluator {
  return (context) => {
    const root = contextNode(context).root;
    if (root.kind !== NodeKind.DOCUMENT)
      return dynamicError(XPathErrorCode.ROOT_NOT_A_DOCUMENT, 'The root of the context node is not a document');
    return [root];
  };
}

/** A value filtered by each predicate in turn. */
function filteredByAll(value: XdmValue, predicates: readonly CompiledPredicate[], context: DynamicContext): XdmValue {
  let kept = value;
  for (const predicate of predicates) kept = predicate(kept, context);
  return kept;
}

/** The focus a step of a path runs with for the item at an index, which must be a node; XPTY0019 for another item. */
function stepFocus(value: XdmValue, index: number, context: DynamicContext): DynamicContext {
  if (!isNode(value[index] as XdmItem))
    return dynamicError(
      XPathErrorCode.STEP_NOT_NODES,
      'A step of a path, before the last, gave an item that is not a node'
    );
  return context.focusOn(value, index);
}

/** A compiled step of a path: its evaluator, whether it gives nodes in document order without duplicates, and an axis step's parts. */
interface CompiledStep {
  readonly evaluator: Evaluator;
  readonly givesOrderedNodes: boolean;
  readonly parts: StepParts | undefined;
}

/** Applies one step of a path to every node of the value before it, each as the focus. */
function applyStep(value: XdmValue, step: CompiledStep, context: DynamicContext): XdmValue {
  const size = value.length;
  if (size === 0) return value;
  // From one node, a step that gives nodes in document order gives the path's nodes as they are.
  if (size === 1 && step.givesOrderedNodes) return step.evaluator(stepFocus(value, 0, context));
  const results: XdmItem[] = [];
  for (let index = 0; index < size; index++) {
    for (const result of step.evaluator(stepFocus(value, index, context))) results.push(result);
  }
  return step.givesOrderedNodes ? inDocumentOrder(results as XdmNode[]) : orderedResults(results);
}

/** The pausable form of `applyStep`: the step run for each node in turn. */
function applyStepInTurn(value: XdmValue, step: Evaluator, context: DynamicContext): Pausable<XdmValue> {
  return after(
    joinedInTurn(value.length, (index) => step(stepFocus(value, index, context))),
    orderedResults
  );
}

/** A step's results: nodes in document order without duplicates, other items as they came; XPTY0018 for a mix. */
function orderedResults(results: readonly XdmItem[]): XdmValue {
  const first = results[0];
  if (first === undefined) return results;
  const holdsNodes = isNode(first);
  // Every item must be what the first is: all nodes, sorted, or all other items, as they came.
  for (const item of results) {
    if (isNode(item) !== holdsNodes)
      return dynamicError(XPathErrorCode.MIXED_PATH_RESULT, 'A step of a path gave both nodes and other items');
  }
  return holdsNodes ? inDocumentOrder(results as readonly XdmNode[]) : results;
}

/** A path's steps with `//name` as `descendant::name`, which gives the same nodes when no predicate of the child step depends on position. */
function withDescendantSteps(steps: readonly Expression[], state: CompileState): Expression[] {
  const rewritten: Expression[] = [];
  for (const step of steps) {
    const previous = rewritten.at(-1);
    if (
      isAnyDescendantOrSelf(previous) &&
      step.kind === 'axis-step' &&
      step.axis === 'child' &&
      step.predicates.every((predicate) => isPositionFree(predicate, state))
    )
      rewritten[rewritten.length - 1] = { ...step, axis: 'descendant', start: previous.start };
    else rewritten.push(step);
  }
  return rewritten;
}

/**
 * `//x[p]` when a predicate depends on position: the `x` children of every node below the context
 * node, which are its `x` descendants grouped by parent, each group filtered as the child step would.
 */
function compileChildrenOfDescendants(step: AxisStep, state: CompileState): Evaluator | undefined {
  const test = compileNodeTest(step.nodeTest, 'descendant', state.context);
  const predicates = step.predicates.map((predicate) => compilePredicate(predicate, state));
  if (anyPausable(...predicates)) return undefined;
  return (context) => {
    const groups = new Map<number, XdmNode[]>();
    const refine = test.refine;
    const node = contextNode(context);
    for (const found of nodeListOnAxis(node, 'descendant', test.forTree(node.tree))) {
      if (refine !== undefined && !refine(found)) continue;
      const parent = found.tree.parent(found.index);
      const group = groups.get(parent);
      if (group === undefined) groups.set(parent, [found]);
      else group.push(found);
    }
    const kept: XdmNode[] = [];
    for (const group of groups.values()) {
      for (const found of filteredByAll(group, predicates, context)) kept.push(found as XdmNode);
    }
    return inDocumentOrder(kept);
  };
}

/** Any element, the nodes attributes belong to. */
const ANY_ELEMENT: NodeTest = { kind: NodeKind.ELEMENT, name: ANY_NAME };

/** `//@a[p]` when a predicate depends on position: the attributes of the context node and every element below it, each element's filtered as the attribute step would. */
function compileAttributesOfDescendants(step: AxisStep, state: CompileState): Evaluator | undefined {
  const attributes = compileAxisStep(step, state);
  if (anyPausable(attributes)) return undefined;
  return (context) => {
    // An element's attributes come after it and before its descendants, so this is document order.
    const kept: XdmNode[] = [];
    for (const element of nodeListOnAxis(contextNode(context), 'descendant-or-self', ANY_ELEMENT)) {
      for (const found of attributes(context.withFocus(element, 1, 1))) kept.push(found as XdmNode);
    }
    return kept;
  };
}

/** `//` and the step after it as one evaluator when that walks the tree once: a child or attribute step whose predicates depend on position. */
function compileStepOfDescendants(step: Expression | undefined, state: CompileState): Evaluator | undefined {
  if (step?.kind !== 'axis-step') return undefined;
  if (step.axis === 'child') return compileChildrenOfDescendants(step, state);
  return step.axis === 'attribute' ? compileAttributesOfDescendants(step, state) : undefined;
}

/** A path's steps compiled; `//` and the step after it as one where `compileStepOfDescendants` can, unless `grouping` is off. */
function compileSteps(steps: readonly Expression[], state: CompileState, grouping: boolean): CompiledStep[] {
  const compiled: CompiledStep[] = [];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index] as Expression;
    const grouped =
      grouping && isAnyDescendantOrSelf(step) ? compileStepOfDescendants(steps[index + 1], state) : undefined;
    if (grouped !== undefined) {
      compiled.push({ evaluator: grouped, givesOrderedNodes: true, parts: undefined });
      index++;
    } else if (step.kind === 'axis-step' && index > 0) {
      const parts = compileStepParts(step, state);
      compiled.push({ evaluator: stepEvaluator(parts), givesOrderedNodes: true, parts });
    } else {
      const givesOrderedNodes = step.kind === 'axis-step' || step.kind === 'root';
      compiled.push({ evaluator: compile(step, state), givesOrderedNodes, parts: undefined });
    }
  }
  return compiled;
}

/** `a/b/c`: each step applied to every node the one before gave; on node numbers when its steps are axis steps that fit. */
export function compilePath(path: PathExpression, state: CompileState): Evaluator {
  const syntax = withDescendantSteps(path.steps, state);
  const onNumbers = pathFitsNumbers(syntax, state);
  const steps = compileSteps(syntax, state, !onNumbers);
  const start = (steps[0] as CompiledStep).evaluator;
  const rest = steps.slice(1);
  const numberPath = onNumbers
    ? numberPathOf(
        syntax,
        rest.map((step) => step.parts as StepParts)
      )
    : undefined;
  if (numberPath === undefined && steps.some((step) => anyPausable(step.evaluator)))
    return pausable((context) => {
      let value: Pausable<XdmValue> = start(context);
      for (const step of rest) value = after(value, (before) => applyStepInTurn(before, step.evaluator, context));
      return value;
    });
  const following = (value: XdmValue, context: DynamicContext): XdmValue => {
    let result = value;
    for (const step of rest) result = applyStep(result, step, context);
    return result;
  };
  if (numberPath === undefined) return (context) => following(start(context), context);
  const onValue = paysOnNumbers(numberPath) ? numberPathValue(numberPath, following) : following;
  // A first step that pauses is waited for; the steps on numbers then cannot pause.
  if (anyPausable(start)) return pausable((context) => after(start(context), (value) => onValue(value, context)));
  return withStream(
    (context) => onValue(start(context), context),
    () => {
      const stream = numberPathStream(numberPath, following);
      return (context) => stream(start(context), context);
    }
  );
}
