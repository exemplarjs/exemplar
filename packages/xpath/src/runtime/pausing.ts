import type { XdmItem, XdmValue } from '@exemplarjs/xdm';
import type { DynamicContext, Evaluator } from './dynamic-context.ts';

/** A value, or a promise of it while a resource it needs has yet to arrive. */
export type Pausable<Value> = Value | Promise<Value>;

/** An evaluator that may pause: it gives its value, or a promise of it while a resource is pending. */
export type PausableEvaluator = (context: DynamicContext) => Pausable<XdmValue>;

/** The evaluators and predicates that may pause, as the compiler marks them. */
const PAUSABLE = new WeakSet<object>();

/**
 * Marks an evaluator, or a predicate, as one that may pause; an evaluator is typed as an `Evaluator`
 * so it fits where any does. Only the pausable forms of constructs call such evaluators directly,
 * treating their results as possibly promises; others are given its value through the compiler.
 */
export function pausable(evaluator: PausableEvaluator): Evaluator;
export function pausable<Compiled extends object>(compiled: Compiled): Compiled;
export function pausable(compiled: object): object {
  PAUSABLE.add(compiled);
  return compiled;
}

/** Whether any of some compiled functions may pause. */
export function anyPausable(...compiled: readonly object[]): boolean {
  for (const each of compiled) if (PAUSABLE.has(each)) return true;
  return false;
}

/** The next step after a value: at once when it is there, when it arrives when it is a promise. */
export function after<Value, Result>(
  value: Pausable<Value>,
  next: (value: Value) => Pausable<Result>
): Pausable<Result> {
  return value instanceof Promise ? value.then(next) : next(value);
}

/** The next step on what a function gives, or on the error it raises or its promise rejects with. */
export function attempt<Value, Result>(
  run: () => Pausable<Value>,
  next: (value: Value) => Pausable<Result>,
  failed: (error: unknown) => Pausable<Result>
): Pausable<Result> {
  let value: Pausable<Value>;
  try {
    value = run();
  } catch (error) {
    return failed(error);
  }
  return value instanceof Promise ? value.then(next, failed) : next(value);
}

/**
 * The results of `count` steps run in turn, each waited for before the next; a promise only once a
 * step gives one. Each step is given the results so far.
 */
export function inTurn<Result>(
  count: number,
  step: (index: number, results: readonly Result[]) => Pausable<Result>,
  results: Result[] = []
): Pausable<Result[]> {
  for (let index = results.length; index < count; index++) {
    const result = step(index, results);
    if (result instanceof Promise)
      return result.then((value) => {
        results.push(value);
        return inTurn(count, step, results);
      });
    results.push(result);
  }
  return results;
}

/** Whether a test holds at some index, tried in turn from `from` until one does. */
export function someInTurn(count: number, test: (index: number) => Pausable<boolean>, from = 0): Pausable<boolean> {
  for (let index = from; index < count; index++) {
    const holds = test(index);
    if (holds instanceof Promise) {
      const next = index + 1;
      return holds.then((found) => found || someInTurn(count, test, next));
    }
    if (holds) return true;
  }
  return false;
}

/**
 * The values of `count` steps run in turn and joined into one, each waited for before the next; a
 * promise only once a step gives one. Each step's items are added as it gives them, in one pass.
 */
export function joinedInTurn(
  count: number,
  step: (index: number) => Pausable<XdmValue>,
  joined: XdmItem[] = [],
  from = 0
): Pausable<XdmValue> {
  for (let index = from; index < count; index++) {
    const value = step(index);
    if (value instanceof Promise) {
      const next = index + 1;
      return value.then((items) => {
        for (const item of items) joined.push(item);
        return joinedInTurn(count, step, joined, next);
      });
    }
    for (const item of value) joined.push(item);
  }
  return joined;
}

/** The items a test keeps, tried in turn, each waited for before the next; a promise only once a test gives one. */
export function keptInTurn(
  items: XdmValue,
  test: (index: number) => Pausable<boolean>,
  kept: XdmItem[] = [],
  from = 0
): Pausable<XdmValue> {
  for (let index = from; index < items.length; index++) {
    const holds = test(index);
    if (holds instanceof Promise) {
      const item = items[index] as XdmItem;
      const next = index + 1;
      return holds.then((found) => {
        if (found) kept.push(item);
        return keptInTurn(items, test, kept, next);
      });
    }
    if (holds) kept.push(items[index] as XdmItem);
  }
  return kept;
}
