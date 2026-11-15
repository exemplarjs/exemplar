import type { XdmValue } from '@exemplarjs/xdm';
import { XPathErrorCode, xpathError } from '@/api/xpath-exception';
import type { Evaluator } from '@/runtime/dynamic-context';
import { after, anyPausable, inTurn, pausable } from '@/runtime/pausing';
import type { StaticContext } from '@/static/static-context';
import type { Expression, Span } from '@/syntax/syntax-tree';
import { compileArithmetic, compileUnary } from './compile-arithmetic.ts';
import { compileBindingExpression, compileVariableReference } from './compile-bindings.ts';
import { compileCall, compileDynamicCall } from './compile-calls.ts';
import { compileComparison } from './compile-comparisons.ts';
import { compileInlineFunction, compileNamedFunctionReference } from './compile-functions.ts';
import { compileIf, compileLogical, compileQuantified } from './compile-logic.ts';
import { compilePath, compileRoot } from './compile-paths.ts';
import {
  compileContextItem,
  compileFilter,
  compileLiteral,
  compileRange,
  compileSequence,
  compileSetOperation,
  compileSimpleMap,
  compileStringConcatenation,
} from './compile-sequences.ts';
import { compileAxisStep } from './compile-steps.ts';
import {
  compileCurlyArray,
  compileLookup,
  compileMapConstructor,
  compileSquareArray,
  compileUnaryLookup,
} from './compile-structures.ts';
import { compileTypeExpression } from './compile-types.ts';

/** A variable in scope while compiling: its expanded key, its slot, and the scope it was bound in. */
interface VariableScope {
  readonly key: string;
  readonly slot: number;
  readonly outer: VariableScope | undefined;
}

/** What compiling an expression keeps track of: the static context, the variables in scope and the slots used. */
export interface CompileState {
  readonly context: StaticContext;
  scope: VariableScope | undefined;
  /** How many variable slots the expression needs; bindings take the next one. */
  slotCount: number;
  /** The absolute URIs of resources the expression names as literals, gathered as calls are compiled. */
  readonly resourceURIs: string[];
  /** The pausable operands of the expression being compiled, gathered when it evaluates each operand once in its own focus. */
  operands: Operands | undefined;
  /** Whether each predicate asked about reads no position, as several rewrites ask of one predicate. */
  readonly positionFree: Map<Expression, boolean>;
}

/** An expression's operands that may pause, evaluated before it runs, and their values while it does. */
interface Operands {
  readonly evaluators: Evaluator[];
  values: readonly XdmValue[];
}

/** The kinds of expression with pausable forms of their own: they bind variables, change the focus, or choose what to evaluate. */
const OWN_PAUSABLE_FORMS: ReadonlySet<Expression['kind']> = new Set([
  'for',
  'let',
  'quantified',
  'if',
  'logical',
  'path',
  'axis-step',
  'filter',
  'simple-map',
  'inline-function',
]);

/**
 * Compiles an expression into an evaluator, by its kind. An expression that evaluates each operand
 * once in its own focus, such as `a + b`, gets its pausable form here: operands that may pause are
 * evaluated first, waiting as they must, and the expression's own evaluator then reads their values.
 */
export function compile(expression: Expression, state: CompileState): Evaluator {
  const outer = state.operands;
  const operands = OWN_PAUSABLE_FORMS.has(expression.kind) ? undefined : { evaluators: [], values: [] };
  state.operands = operands;
  const compiled = compileKind(expression, state);
  state.operands = outer;
  const hasPausableOperands = operands !== undefined && operands.evaluators.length > 0;
  const evaluator = hasPausableOperands ? afterOperands(operands, compiled) : compiled;
  if (outer === undefined || !anyPausable(evaluator)) return evaluator;
  // The enclosing expression evaluates this operand first; the stub returned reads its value.
  const index = outer.evaluators.push(evaluator) - 1;
  return () => outer.values[index] as XdmValue;
}

/** Runs the pausable operands in turn, then the evaluator with their values; restores the previous values afterwards. */
function afterOperands(operands: Operands, evaluator: Evaluator): Evaluator {
  const { evaluators } = operands;
  return pausable((context) =>
    after(
      inTurn(evaluators.length, (index) => (evaluators[index] as Evaluator)(context)),
      (values) => {
        const before = operands.values;
        operands.values = values;
        try {
          return evaluator(context);
        } finally {
          operands.values = before;
        }
      }
    )
  );
}

/** Raises a static error at a part of the expression. */
export function staticError(state: CompileState, code: string, message: string, at: Span): never {
  return xpathError(code, message, at, state.context.text);
}

/** A compiler for one kind of expression, given the node narrowed to that kind. */
type KindCompilers = {
  readonly [K in Expression['kind']]: (expression: Extract<Expression, { kind: K }>, state: CompileState) => Evaluator;
};

/** The compiler for each kind of expression, its operands compiled by `compile`. */
const KIND_COMPILERS: KindCompilers = {
  literal: compileLiteral,
  'context-item': compileContextItem,
  'variable-reference': compileVariableReference,
  sequence: compileSequence,
  root: compileRoot,
  path: compilePath,
  'axis-step': compileAxisStep,
  filter: compileFilter,
  'simple-map': compileSimpleMap,
  range: compileRange,
  'string-concatenation': compileStringConcatenation,
  'set-operation': compileSetOperation,
  comparison: compileComparison,
  arithmetic: compileArithmetic,
  unary: compileUnary,
  logical: compileLogical,
  if: compileIf,
  quantified: compileQuantified,
  for: compileBindingExpression,
  let: compileBindingExpression,
  'instance-of': compileTypeExpression,
  'treat-as': compileTypeExpression,
  'castable-as': compileTypeExpression,
  'cast-as': compileTypeExpression,
  'function-call': compileCall,
  'static-arrow': compileCall,
  'dynamic-call': compileDynamicCall,
  'dynamic-arrow': compileDynamicCall,
  'named-function-reference': compileNamedFunctionReference,
  'inline-function': compileInlineFunction,
  'map-constructor': compileMapConstructor,
  'square-array-constructor': compileSquareArray,
  'curly-array-constructor': compileCurlyArray,
  lookup: compileLookup,
  'unary-lookup': compileUnaryLookup,
};

/** Compiles an expression into an evaluator by its kind. */
function compileKind(expression: Expression, state: CompileState): Evaluator {
  // The table pairs each kind with its node type, which TypeScript cannot correlate through the union.
  const compileExpression = KIND_COMPILERS[expression.kind] as (
    expression: Expression,
    state: CompileState
  ) => Evaluator;
  return compileExpression(expression, state);
}

/** Raises XPST0008 for a variable that is not in scope. */
export function undeclaredVariable(state: CompileState, name: string, at: Span): never {
  return staticError(state, XPathErrorCode.UNDECLARED_NAME, `The variable $${name} is not declared`, at);
}
