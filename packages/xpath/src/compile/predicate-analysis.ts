import { isIntegerType, isNumericType, XS } from '@exemplarjs/xdm';
import type { SequenceTypeMatcher } from '@/static/matchers';
import { resolveFunctionName } from '@/static/name-resolution';
import { FN_NAMESPACE } from '@/static/static-context';
import type { AxisStep, Expression, UnresolvedName } from '@/syntax/syntax-tree';
import { findFunctionName } from '@/syntax/syntax-walk';
import type { CompileState } from './compiler.ts';

/** A predicate that is a literal integer, which picks one item by position without evaluating anything per item. */
export function literalPosition(predicate: Expression): number | undefined {
  if (predicate.kind !== 'literal' || !isIntegerType(predicate.value.type)) return undefined;
  return Number(predicate.value.value);
}

/** Whether a predicate is `last()`, which picks the last item. */
export function isLastCall(predicate: Expression, state: CompileState): boolean {
  if (predicate.kind !== 'function-call' || predicate.arguments.length > 0) return false;
  const name = resolveFunctionName(predicate.name, state.context);
  return name.localName === 'last' && name.namespaceURI === FN_NAMESPACE;
}

/** Whether an expression reads nothing of the focus: literals and variables, combined by arithmetic, and paths from them. */
export function isFocusFree(expression: Expression): boolean {
  switch (expression.kind) {
    case 'literal':
    case 'variable-reference': {
      return true;
    }
    case 'arithmetic': {
      return isFocusFree(expression.left) && isFocusFree(expression.right);
    }
    case 'unary': {
      return isFocusFree(expression.operand);
    }
    case 'sequence': {
      return expression.items.every((item) => isFocusFree(item));
    }
    case 'path': {
      // The steps after the first take their focus from the step before.
      return isFocusFree(expression.steps[0] as Expression);
    }
    default: {
      return false;
    }
  }
}

/** Whether values of a type hold no number: nodes, or atomic values of a type that is not numeric. */
function holdsNoNumber(type: SequenceTypeMatcher): boolean {
  const shape = type.itemType?.shape;
  if (shape === undefined || shape.kind === 'node' || shape.kind === 'nothing') return true;
  return shape.kind === 'atomic' && !isNumericType(shape.type) && shape.type !== XS.anyAtomicType;
}

/** Whether an expression gives a boolean or nodes, never a number that a predicate would read as a position. */
function givesNoNumber(expression: Expression, state: CompileState): boolean {
  switch (expression.kind) {
    case 'comparison':
    case 'logical':
    case 'quantified':
    case 'instance-of':
    case 'castable-as':
    case 'axis-step': {
      return true;
    }
    case 'path': {
      return expression.steps.at(-1)?.kind === 'axis-step';
    }
    case 'function-call': {
      const context = state.context;
      const resolved = resolveFunctionName(expression.name, context);
      const definition = context.functions.find(resolved.namespaceURI, resolved.localName, expression.arguments.length);
      return definition !== undefined && holdsNoNumber(definition.returnType);
    }
    default: {
      return false;
    }
  }
}

/** The functions that read the focus's position: `position()`, `last()`, and any `function-lookup` finds, run in its focus. */
const POSITIONAL_FUNCTIONS: ReadonlySet<string> = new Set(['position', 'last', 'function-lookup']);

/** Whether a function name is one of those that read the focus's position. */
function isPositionalFunction(name: UnresolvedName): boolean {
  return POSITIONAL_FUNCTIONS.has(name.localName);
}

/** Whether an expression's text names one of the functions that read the focus's position. */
function mentionsPositionalFunction(text: string): boolean {
  for (const name of POSITIONAL_FUNCTIONS) if (text.includes(name)) return true;
  return false;
}

/** Whether a predicate keeps an item by its effective boolean value alone: it gives no number and reads no position. */
export function isPositionFree(predicate: Expression, state: CompileState): boolean {
  let free = state.positionFree.get(predicate);
  if (free === undefined) {
    free = analysePositionFree(predicate, state);
    state.positionFree.set(predicate, free);
  }
  return free;
}

/** Whether a predicate gives no number and reads no position, the cheap checks first: a predicate whose text names none of those functions cannot call them. */
function analysePositionFree(predicate: Expression, state: CompileState): boolean {
  if (!givesNoNumber(predicate, state)) return false;
  if (!mentionsPositionalFunction(state.context.text.slice(predicate.start, predicate.end))) return true;
  return findFunctionName(predicate, isPositionalFunction) === undefined;
}

/** Whether a step is the `descendant-or-self::node()` that `//` stands for. */
export function isAnyDescendantOrSelf(step: Expression | undefined): step is AxisStep {
  return (
    step?.kind === 'axis-step' &&
    step.axis === 'descendant-or-self' &&
    step.nodeTest.kind === 'any-kind-test' &&
    step.predicates.length === 0
  );
}
