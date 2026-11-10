import { booleanOf, booleanResult, effectiveBooleanValue } from '@/runtime/boolean-value';
import type { DynamicContext, Evaluator } from '@/runtime/dynamic-context';
import { type Streamer, streamOf, truthReader } from '@/runtime/item-streams';
import { after, anyPausable, pausable } from '@/runtime/pausing';
import type { IfExpression, LogicalExpression, QuantifiedExpression } from '@/syntax/syntax-tree';
import { compileBindings, someCombination } from './compile-bindings.ts';
import { compile, type CompileState } from './compiler.ts';

/** `a or b`, `a and b`, by effective boolean value, the right operand only evaluated when it decides. */
export function compileLogical(logical: LogicalExpression, state: CompileState): Evaluator {
  const left = compile(logical.left, state);
  const right = compile(logical.right, state);
  if (anyPausable(left, right)) {
    const decidedBy = logical.operator === 'or';
    return pausable((context) =>
      after(left(context), (value) =>
        effectiveBooleanValue(value) === decidedBy ? booleanResult(decidedBy) : after(right(context), booleanOf)
      )
    );
  }
  // Each operand's truth read from as few of its items as decide it.
  const first = truthReader(left);
  const second = truthReader(right);
  if (logical.operator === 'or') return (context) => booleanResult(first(context) || second(context));
  return (context) => booleanResult(first(context) && second(context));
}

/** `if (condition) then a else b`. */
export function compileIf(expression: IfExpression, state: CompileState): Evaluator {
  const condition = compile(expression.condition, state);
  const thenBranch = compile(expression.thenExpression, state);
  const elseBranch = compile(expression.elseExpression, state);
  if (anyPausable(condition, thenBranch, elseBranch))
    return pausable((context) =>
      after(condition(context), (value) => (effectiveBooleanValue(value) ? thenBranch : elseBranch)(context))
    );
  const test = truthReader(condition);
  return (context) => (test(context) ? thenBranch(context) : elseBranch(context));
}

/** `some` or `every`: whether the condition holds for some or every combination of the bindings' items. */
export function compileQuantified(expression: QuantifiedExpression, state: CompileState): Evaluator {
  const outer = state.scope;
  const bindings = compileBindings(expression.bindings, state);
  const condition = compile(expression.condition, state);
  state.scope = outer;
  const every = expression.quantifier === 'every';
  /** Whether some combination from the binding at `index` on decides the answer. */
  const streams = bindings.map((binding) => streamOf(binding.value));
  const test = truthReader(condition);
  // Each binding's items read one at a time, so that the first that decides stops the rest.
  const decides = (context: DynamicContext, index: number): boolean => {
    const binding = bindings[index];
    if (binding === undefined) return test(context) !== every;
    const items = (streams[index] as Streamer)(context);
    for (let item = items.next(); item !== undefined; item = items.next()) {
      context.variables[binding.slot] = [item];
      if (decides(context, index + 1)) return true;
    }
    return false;
  };
  if (!anyPausable(condition, ...bindings.map((binding) => binding.value)))
    return (context) => booleanResult(decides(context, 0) !== every);
  const decidesBy = (inner: DynamicContext) =>
    after(condition(inner), (value) => effectiveBooleanValue(value) !== every);
  return pausable((context) =>
    after(someCombination(bindings, 'for', context, decidesBy), (decided) => booleanResult(decided !== every))
  );
}
