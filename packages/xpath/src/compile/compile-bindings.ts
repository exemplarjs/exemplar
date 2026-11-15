import { type XdmItem, type XdmValue } from '@exemplarjs/xdm';
import type { DynamicContext, Evaluator } from '@/runtime/dynamic-context';
import { after, anyPausable, type Pausable, pausable, someInTurn } from '@/runtime/pausing';
import { resolvePlainName } from '@/static/name-resolution';
import { expandedKey } from '@/static/static-context';
import type {
  ForExpression,
  LetExpression,
  UnresolvedName,
  VariableBinding,
  VariableReference,
} from '@/syntax/syntax-tree';
import { compile, type CompileState, undeclaredVariable } from './compiler.ts';

/** Brings a variable into scope with a slot of its own, and returns the slot. */
export function bindVariable(name: UnresolvedName, state: CompileState): number {
  const slot = state.slotCount++;
  state.scope = { key: expandedKey(resolvePlainName(name, state.context)), slot, outer: state.scope };
  return slot;
}

/** `$name`: the value in the slot of the nearest binding, or of the declared variable; XPST0008 for neither. */
export function compileVariableReference(reference: VariableReference, state: CompileState): Evaluator {
  const key = expandedKey(resolvePlainName(reference.name, state.context));
  let slot: number | undefined;
  for (let scope = state.scope; scope !== undefined && slot === undefined; scope = scope.outer) {
    if (scope.key === key) slot = scope.slot;
  }
  slot ??= state.context.variables.get(key)?.slot;
  if (slot === undefined) return undeclaredVariable(state, reference.name.localName, reference);
  const found = slot;
  return (context) => context.variables[found] as XdmValue;
}

/** A binding compiled: the evaluator of its value and its variable's slot. */
export interface Binding {
  readonly value: Evaluator;
  readonly slot: number;
}

/** Compiles bindings in turn, each in scope for those after it; the caller puts the scope back. */
export function compileBindings(bindings: readonly VariableBinding[], state: CompileState): Binding[] {
  return bindings.map((binding) => {
    const value = compile(binding.expression, state);
    return { value, slot: bindVariable(binding.name, state) };
  });
}

/**
 * Whether some combination of the bindings' values decides, in the pausable form: each value waited
 * for, then its items bound in turn for a `for`, or the whole value for a `let`, until `decides` holds.
 */
export function someCombination(
  bindings: readonly Binding[],
  kind: 'for' | 'let',
  context: DynamicContext,
  decides: (context: DynamicContext) => Pausable<boolean>,
  index = 0
): Pausable<boolean> {
  const binding = bindings[index];
  if (binding === undefined) return decides(context);
  return after(binding.value(context), (value) => {
    const bind = (position: number) => {
      context.variables[binding.slot] = kind === 'for' ? [value[position] as XdmItem] : value;
      return someCombination(bindings, kind, context, decides, index + 1);
    };
    return kind === 'for' ? someInTurn(value.length, bind) : bind(0);
  });
}

/** `for` and `let`: each binding in turn, then the body, for each item for a `for`. */
export function compileBindingExpression(expression: ForExpression | LetExpression, state: CompileState): Evaluator {
  const outer = state.scope;
  const bindings = compileBindings(expression.bindings, state);
  const body = compile(expression.body, state);
  state.scope = outer;
  const iterates = expression.kind === 'for';
  /** The body's values for each item of the bindings from `index` on, appended to `results`. */
  const run = (context: DynamicContext, index: number, results: XdmItem[]): void => {
    const binding = bindings[index];
    if (binding === undefined) {
      for (const item of body(context)) results.push(item);
      return;
    }
    const value = binding.value(context);
    if (!iterates) {
      context.variables[binding.slot] = value;
      run(context, index + 1, results);
      return;
    }
    for (const item of value) {
      context.variables[binding.slot] = [item];
      run(context, index + 1, results);
    }
  };
  if (!anyPausable(body, ...bindings.map((binding) => binding.value)))
    return (context) => {
      const results: XdmItem[] = [];
      run(context, 0, results);
      return results;
    };
  // The pausable form: the body's items gathered for each combination, none deciding.
  return pausable((context) => {
    const results: XdmItem[] = [];
    const gather = (inner: DynamicContext) =>
      after(body(inner), (items) => {
        for (const item of items) results.push(item);
        return false;
      });
    return after(someCombination(bindings, expression.kind, context, gather), () => results);
  });
}
