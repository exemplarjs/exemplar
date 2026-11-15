import {
  castAs,
  compareOrder,
  type ComparisonOperator as ValueOperator,
  type ComparisonOptions,
  EMPTY_SEQUENCE,
  isAtomicValue,
  isNode,
  isNumericType,
  valueCompare,
  XdmAtomicValue,
  type XdmItem,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { isStringLike, orderSatisfies } from '@exemplarjs/xdm/internal';
import { byCodePoint } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { atomize, atomizeOptional, isUntyped } from '@/runtime/atomization';
import { booleanResult } from '@/runtime/boolean-value';
import type { Evaluator } from '@/runtime/dynamic-context';
import type { Comparison } from '@/syntax/syntax-tree';
import { compileRangeComparison } from './compile-range-comparisons.ts';
import { compile, type CompileState } from './compiler.ts';

/** The value comparison each general comparison applies to every pair. */
export const GENERAL_TO_VALUE: Readonly<Record<string, ValueOperator>> = {
  '=': 'eq',
  '!=': 'ne',
  '<': 'lt',
  '<=': 'le',
  '>': 'gt',
  '>=': 'ge',
};

/** Compiles a comparison: a value, general or node comparison by its operator. */
export function compileComparison(comparison: Comparison, state: CompileState): Evaluator {
  const operator = comparison.operator;
  const general = GENERAL_TO_VALUE[operator];
  if (general !== undefined && comparison.right.kind === 'range')
    return compileRangeComparison(compile(comparison.left, state), comparison.right, general, false, state);
  if (general !== undefined && comparison.left.kind === 'range')
    return compileRangeComparison(compile(comparison.right, state), comparison.left, general, true, state);
  const left = compile(comparison.left, state);
  const right = compile(comparison.right, state);
  if (operator === 'is' || operator === '<<' || operator === '>>') return nodeComparison(left, right, operator);
  if (general !== undefined)
    return (context) => booleanResult(generalCompare(left(context), right(context), general, context.environment));
  return valueComparison(left, right, operator as ValueOperator);
}

/** An operand of a value comparison; an untyped value compares as a string, as xdm compares it. */
function valueOperand(value: XdmValue): XdmAtomicValue | undefined {
  return atomizeOptional(value, 'Each operand of a value comparison');
}

/** `a eq b` and the others: empty when either operand is. */
function valueComparison(left: Evaluator, right: Evaluator, operator: ValueOperator): Evaluator {
  return (context) => {
    const first = valueOperand(left(context));
    if (first === undefined) return EMPTY_SEQUENCE;
    const second = valueOperand(right(context));
    if (second === undefined) return EMPTY_SEQUENCE;
    return booleanResult(valueCompare(first, second, operator, context.environment));
  };
}

/**
 * Whether two atomized values compare true, made comparable as a general comparison does (§3.7.2):
 * an untyped value as a double against a number, as it is against text (which compares it as a
 * string), else as the other's type.
 */
function pairCompares(
  a: XdmAtomicValue,
  b: XdmAtomicValue,
  operator: ValueOperator,
  options: ComparisonOptions
): boolean {
  const untypedA = isUntyped(a);
  const untypedB = isUntyped(b);
  if (untypedA && !untypedB) return valueCompare(castFor(a, b), b, operator, options);
  if (untypedB && !untypedA) return valueCompare(a, castFor(b, a), operator, options);
  return valueCompare(a, b, operator, options);
}

/** An untyped value cast to compare with another value: to a double for a number, kept for text, else the other's primitive type. */
function castFor(untyped: XdmAtomicValue, other: XdmAtomicValue): XdmAtomicValue {
  if (isNumericType(other.type)) return castAs(untyped, XS.double);
  const isText = isStringLike(other.type);
  return isText ? untyped : castAs(untyped, other.type.primitive);
}

/** A general comparison's operand atomized; one atomic value, the commonest, as it is. */
function atomizedOperand(value: XdmValue): readonly XdmAtomicValue[] {
  return value.length === 1 && isAtomicValue(value[0] as XdmItem) ? (value as XdmAtomicValue[]) : atomize(value);
}

/** Whether a value holds only nodes. */
function holdsOnlyNodes(value: XdmValue): value is readonly XdmNode[] {
  for (const item of value) if (!isNode(item)) return false;
  return true;
}

/** Whether some pair of strings is equal, for `equal`, or differs, by code points, where equal strings are the same string. */
function someStringsEqual(firsts: readonly string[], seconds: readonly string[], equal: boolean): boolean {
  for (const first of firsts) {
    for (const second of seconds) if ((first === second) === equal) return true;
  }
  return false;
}

/** Whether some pair of strings, the string values of nodes, compares true, by code points or `compareStrings`. */
function stringsCompare(
  firsts: readonly string[],
  seconds: readonly string[],
  operator: ValueOperator,
  options: ComparisonOptions
): boolean {
  const compareStrings = options.compareStrings ?? byCodePoint;
  if (compareStrings === byCodePoint && (operator === 'eq' || operator === 'ne'))
    return someStringsEqual(firsts, seconds, operator === 'eq');
  for (const first of firsts) {
    for (const second of seconds) if (orderSatisfies(compareStrings(first, second), operator)) return true;
  }
  return false;
}

/** Whether some pair of atomized values compares true. */
function atomicsCompare(
  firsts: readonly XdmAtomicValue[],
  seconds: readonly XdmAtomicValue[],
  operator: ValueOperator,
  options: ComparisonOptions
): boolean {
  for (const first of firsts) {
    for (const second of seconds) {
      if (pairCompares(first, second, operator, options)) return true;
    }
  }
  return false;
}

/** The string values of nodes: a node's typed value is text, so pairs of nodes compare as strings. */
function stringValues(nodes: readonly XdmNode[]): string[] {
  return nodes.map((node) => node.stringValue);
}

/** `a = b` and the others: true when some pair of atomized values compares true. */
export function generalCompare(
  left: XdmValue,
  right: XdmValue,
  operator: ValueOperator,
  options: ComparisonOptions
): boolean {
  if (left.length === 0 || right.length === 0) return false;
  if (holdsOnlyNodes(left) && holdsOnlyNodes(right))
    return stringsCompare(stringValues(left), stringValues(right), operator, options);
  return atomicsCompare(atomizedOperand(left), atomizedOperand(right), operator, options);
}

/**
 * An operand of general comparisons evaluated once and compared with many values, as a predicate's
 * operand that reads no focus is: its string values, their set and its atomized values are each
 * made once, when first needed.
 */
export class FixedOperand {
  readonly #value: XdmValue;
  readonly #onlyNodes: boolean;
  #strings: readonly string[] | undefined;
  #stringSet: ReadonlySet<string> | undefined;
  #atomized: readonly XdmAtomicValue[] | undefined;

  constructor(value: XdmValue) {
    this.#value = value;
    this.#onlyNodes = holdsOnlyNodes(value);
  }

  /** Whether `fixed op other`, or `other op fixed` when the fixed operand is on the right, is true, as `generalCompare` gives it. */
  compare(other: XdmValue, operator: ValueOperator, options: ComparisonOptions, fixedOnLeft: boolean): boolean {
    if (this.#value.length === 0 || other.length === 0) return false;
    if (this.#onlyNodes && holdsOnlyNodes(other)) {
      const others = stringValues(other);
      // By code points, `=` asks whether any of the other strings is one of the fixed ones.
      const byCodePoints = (options.compareStrings ?? byCodePoint) === byCodePoint;
      if (operator === 'eq' && byCodePoints) return others.some((text) => this.#set().has(text));
      const strings = this.#stringValues();
      return fixedOnLeft
        ? stringsCompare(strings, others, operator, options)
        : stringsCompare(others, strings, operator, options);
    }
    const atomized = this.#atomizedValues();
    const others = atomizedOperand(other);
    return fixedOnLeft
      ? atomicsCompare(atomized, others, operator, options)
      : atomicsCompare(others, atomized, operator, options);
  }

  /** The string values of the operand's nodes. */
  #stringValues(): readonly string[] {
    this.#strings ??= stringValues(this.#value as readonly XdmNode[]);
    return this.#strings;
  }

  /** The set of the operand's string values. */
  #set(): ReadonlySet<string> {
    this.#stringSet ??= new Set(this.#stringValues());
    return this.#stringSet;
  }

  /** The operand's atomized values. */
  #atomizedValues(): readonly XdmAtomicValue[] {
    this.#atomized ??= atomizedOperand(this.#value);
    return this.#atomized;
  }
}

/** An operand of a node comparison: one node or empty. */
function nodeOperand(value: XdmValue): XdmNode | undefined {
  if (value.length === 0) return undefined;
  const item = value[0] as XdmItem;
  if (value.length > 1 || !isNode(item))
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, 'Each operand of a node comparison must be one node or empty');
  return item;
}

/** `a is b`, `a << b`, `a >> b`: by identity and document order; empty when either operand is. */
function nodeComparison(left: Evaluator, right: Evaluator, operator: 'is' | '<<' | '>>'): Evaluator {
  return (context) => {
    const first = nodeOperand(left(context));
    const second = nodeOperand(right(context));
    if (first === undefined || second === undefined) return EMPTY_SEQUENCE;
    const order = compareOrder(first, second);
    if (operator === 'is') return booleanResult(order === 0);
    return booleanResult(operator === '<<' ? order < 0 : order > 0);
  };
}
