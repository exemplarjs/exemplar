import {
  type ComparisonOperator as ValueOperator,
  Decimal,
  EMPTY_SEQUENCE,
  isAtomicValue,
  isNumericType,
  type XdmAtomicValue,
  type XdmItem,
  type XdmValue,
} from '@exemplarjs/xdm';
import { booleanResult, effectiveBooleanValue } from '@/runtime/boolean-value';
import type { DynamicContext, Evaluator } from '@/runtime/dynamic-context';
import { truthReader } from '@/runtime/item-streams';
import { after, anyPausable, keptInTurn, type Pausable, pausable } from '@/runtime/pausing';
import type { Expression } from '@/syntax/syntax-tree';
import { FixedOperand, GENERAL_TO_VALUE, generalCompare } from './compile-comparisons.ts';
import { compile, type CompileState } from './compiler.ts';
import { isFocusFree, isLastCall, isPositionFree, literalPosition } from './predicate-analysis.ts';

/** A compiled predicate: a filter of values, run in the focus the value is filtered in. */
export type CompiledPredicate = (value: XdmValue, context: DynamicContext) => XdmValue;

/** A test of one item, with it as the focus. */
export type FocusTest = (focus: DynamicContext) => boolean;

/** A condition's test of each item's focus, made in the focus the items are filtered in. */
export type ConditionTest = (context: DynamicContext) => FocusTest;

/** The tests of no conditions, shared. */
const NO_TESTS: readonly FocusTest[] = [];

/** Conditions' tests, made ready in a focus. */
export function focusTests(
  conditions: readonly ConditionTest[] | undefined,
  context: DynamicContext
): readonly FocusTest[] {
  return conditions === undefined || conditions.length === 0
    ? NO_TESTS
    : conditions.map((condition) => condition(context));
}

/**
 * A predicate that reads no position, compiled to test one item at a time. `test` makes the test of
 * each item's focus, evaluating then, once, what reads no focus, as a comparison's operand
 * `$person/@id` in `[@id = $person/@id]`. One that may pause has no test, only its filter.
 */
export type CompiledCondition =
  | { readonly pauses: false; readonly test: ConditionTest; readonly predicate: CompiledPredicate }
  | { readonly pauses: true; readonly predicate: CompiledPredicate };

/** The one number a predicate's value holds, or undefined when it is anything else, which keeps items by effective boolean value. */
function numericResult(result: XdmValue): XdmAtomicValue | undefined {
  if (result.length !== 1) return undefined;
  const first = result[0] as XdmItem;
  if (!isAtomicValue(first) || !isNumericType(first.type)) return undefined;
  return first;
}

/** The position a number stands for, as `eq` compares it with one: undefined when it is not a whole number. */
function positionOf(number: XdmAtomicValue): number | undefined {
  const content = number.value;
  if (typeof content === 'bigint') return Number(content);
  if (content instanceof Decimal) return content.isInteger() ? Number(content.truncate()) : undefined;
  return Number.isInteger(content) ? (content as number) : undefined;
}

/** Whether a predicate's value keeps the item at a position: a number equal to the position, or a true effective boolean value. */
function predicateHolds(result: XdmValue, position: number): boolean {
  const number = numericResult(result);
  return number === undefined ? effectiveBooleanValue(result) : positionOf(number) === position;
}

/** The item at a 1-based position as a sequence, empty when there is none there. */
function itemAt(value: XdmValue, position: number | undefined): XdmValue {
  const item = position === undefined || position < 1 ? undefined : value[position - 1];
  return item === undefined ? EMPTY_SEQUENCE : [item];
}

/** The items a predicate's one value keeps: the item at its position for a number, else all or none by its effective boolean value. */
function keptByValue(value: XdmValue, result: XdmValue): XdmValue {
  const number = numericResult(result);
  if (number === undefined) return effectiveBooleanValue(result) ? value : EMPTY_SEQUENCE;
  return itemAt(value, positionOf(number));
}

/** A predicate's evaluator as a filter of values, each item kept by position for a number, else by effective boolean value. */
function filterByPredicate(evaluator: Evaluator): CompiledPredicate {
  if (!anyPausable(evaluator)) {
    const test: FocusTest = (focus) => predicateHolds(evaluator(focus), focus.position);
    return (value, context) => keptByTest(value, test, context);
  }
  return pausable((value: XdmValue, context: DynamicContext) =>
    keptInTurn(value, (index) => {
      const result = evaluator(context.focusOn(value, index)) as Pausable<XdmValue>;
      return result instanceof Promise
        ? result.then((found) => predicateHolds(found, index + 1))
        : predicateHolds(result, index + 1);
    })
  ) as CompiledPredicate;
}

/** A general comparison with one operand that reads no focus, as `@id = $person/@id`, its operands compiled apart. */
interface HoistedComparison {
  readonly fixedOperand: Evaluator;
  readonly varyingOperand: Evaluator;
  readonly fixedOnLeft: boolean;
  readonly operator: ValueOperator;
}

/** A predicate's general comparison with one operand that reads no focus, so it can be evaluated once per value filtered; else undefined. */
function hoistedComparison(predicate: Expression, state: CompileState): HoistedComparison | undefined {
  if (predicate.kind !== 'comparison') return undefined;
  const operator = GENERAL_TO_VALUE[predicate.operator];
  const { left, right } = predicate;
  if (operator === undefined || left.kind === 'range' || right.kind === 'range') return undefined;
  const fixedOnLeft = isFocusFree(left);
  if (fixedOnLeft === isFocusFree(right)) return undefined;
  const fixedOperand = compile(fixedOnLeft ? left : right, state);
  const varyingOperand = compile(fixedOnLeft ? right : left, state);
  return { fixedOperand, varyingOperand, fixedOnLeft, operator };
}

/** The comparison as one evaluator, for when an operand may pause: the left operand first, as the compiler evaluates operands. */
function pausableComparison({ fixedOperand, varyingOperand, fixedOnLeft, operator }: HoistedComparison): Evaluator {
  const left = fixedOnLeft ? fixedOperand : varyingOperand;
  const right = fixedOnLeft ? varyingOperand : fixedOperand;
  return pausable((context) =>
    after(left(context), (first) =>
      after(right(context), (second) => booleanResult(generalCompare(first, second, operator, context.environment)))
    )
  );
}

/** The test for a hoisted comparison, its fixed operand evaluated once in the focus the items are filtered in. */
function comparisonTest(comparison: HoistedComparison): ConditionTest {
  const { varyingOperand, fixedOnLeft, operator } = comparison;
  return (context) => {
    const fixedOperand = new FixedOperand(comparison.fixedOperand(context));
    const environment = context.environment;
    return (focus) => fixedOperand.compare(varyingOperand(focus), operator, environment, fixedOnLeft);
  };
}

/** The test for any other condition: its effective boolean value, read from as few items as decide it; once, for one that reads no focus. */
function truthTest(evaluator: Evaluator, focusFree: boolean): ConditionTest {
  const truth = truthReader(evaluator);
  if (focusFree)
    return (context) => {
      const holds = truth(context);
      return () => holds;
    };
  return () => truth;
}

/** The items of a value whose focus passes a test. */
function keptByTest(value: XdmValue, test: FocusTest, context: DynamicContext): XdmValue {
  const size = value.length;
  const kept: XdmItem[] = [];
  for (let index = 0; index < size; index++) {
    const item = value[index] as XdmItem;
    if (test(context.withFocus(item, index + 1, size))) kept.push(item);
  }
  return kept;
}

/** A condition's test as a filter of values, made ready only when there are items. */
function filterByTest(test: ConditionTest): CompiledPredicate {
  return (value, context) => (value.length === 0 ? value : keptByTest(value, test(context), context));
}

/** Compiles a predicate that reads no position as a condition. */
export function compileCondition(predicate: Expression, state: CompileState): CompiledCondition {
  const comparison = hoistedComparison(predicate, state);
  if (comparison !== undefined && !anyPausable(comparison.fixedOperand, comparison.varyingOperand)) {
    const test = comparisonTest(comparison);
    return { pauses: false, test, predicate: filterByTest(test) };
  }
  const evaluator = comparison === undefined ? compile(predicate, state) : pausableComparison(comparison);
  if (anyPausable(evaluator)) return { pauses: true, predicate: filterByPredicate(evaluator) };
  const test = truthTest(evaluator, isFocusFree(predicate));
  return { pauses: false, test, predicate: filterByTest(test) };
}

/** Compiles a predicate into a filter of values. */
export function compilePredicate(predicate: Expression, state: CompileState): CompiledPredicate {
  const position = literalPosition(predicate);
  if (position !== undefined) return (value) => itemAt(value, position);
  if (isLastCall(predicate, state)) return (value) => itemAt(value, value.length);
  if (isPositionFree(predicate, state)) return compileCondition(predicate, state).predicate;
  const evaluator = compile(predicate, state);
  // A predicate that reads no focus is evaluated once, and only when there are items to filter.
  if (!anyPausable(evaluator) && isFocusFree(predicate))
    return (value, context) => (value.length === 0 ? value : keptByValue(value, evaluator(context)));
  return filterByPredicate(evaluator);
}
