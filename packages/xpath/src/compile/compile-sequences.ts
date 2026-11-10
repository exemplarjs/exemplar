import {
  castAs,
  compareOrder,
  EMPTY_SEQUENCE,
  isIntegerType,
  isNode,
  XdmAtomicValue,
  type XdmItem,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { uncheckedAtomicValue } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { stringValueOf } from '@/functions/core/strings';
import { atomizeOptional, isUntyped } from '@/runtime/atomization';
import { inDocumentOrder } from '@/runtime/document-order';
import type { Evaluator } from '@/runtime/dynamic-context';
import { hasStream, type ItemStream, JoinedStream, streamOf, withStream } from '@/runtime/item-streams';
import { FilteredStream } from '@/runtime/node-streams';
import { after, anyPausable, joinedInTurn, pausable } from '@/runtime/pausing';
import type {
  Filter,
  Literal,
  RangeExpression,
  SequenceExpression,
  SetOperation,
  SimpleMap,
  StringConcatenation,
} from '@/syntax/syntax-tree';
import { compileCondition, compilePredicate } from './compile-predicates.ts';
import { compile, type CompileState } from './compiler.ts';
import { isPositionFree, literalPosition } from './predicate-analysis.ts';

/** A literal: its value, made once. */
export function compileLiteral(literal: Literal): Evaluator {
  const value: XdmValue = [literal.value];
  return () => value;
}

/** `.`: the context item, which must exist. */
export function compileContextItem(): Evaluator {
  return (context) => [context.contextItem()];
}

/** `(a, b, ...)`: each item's value in turn; as a stream, each item's stream when the one before runs out. */
export function compileSequence(sequence: SequenceExpression, state: CompileState): Evaluator {
  const items = sequence.items.map((item) => compile(item, state));
  if (items.length === 0) return () => EMPTY_SEQUENCE;
  const evaluator: Evaluator = (context) => items.flatMap((item) => item(context));
  // Items that may pause run before the sequence, as its operands, so these cannot.
  return withStream(evaluator, () => {
    const streamers = items.map((item) => streamOf(item));
    return (context) => new JoinedStream(streamers, context);
  });
}

/** `base[predicate]`; over a base with a stream, a literal position stops at its item and a predicate that reads no position filters as it reads. */
export function compileFilter(filter: Filter, state: CompileState): Evaluator {
  const base = compile(filter.base, state);
  const position = literalPosition(filter.predicate);
  // Only a base with a stream reads less for a position; a value's item is at hand.
  if (position !== undefined && hasStream(base)) {
    const items = streamOf(base);
    return (context) => nthItem(items(context), position);
  }
  const condition = isPositionFree(filter.predicate, state) ? compileCondition(filter.predicate, state) : undefined;
  const predicate = condition?.predicate ?? compilePredicate(filter.predicate, state);
  if (anyPausable(base, predicate))
    return pausable((context) => after(base(context), (value) => predicate(value, context)));
  const evaluator: Evaluator = (context) => predicate(base(context), context);
  if (condition?.pauses !== false || !hasStream(base)) return evaluator;
  const { test } = condition;
  const items = streamOf(base);
  return withStream(evaluator, () => (context) => {
    const holds = test(context);
    return new FilteredStream(items(context), (item) => holds(context.withFocus(item, 1, 1)));
  });
}

/** The item at a 1-based position of a stream, as a value, reading no further. */
function nthItem(stream: ItemStream, position: number): XdmValue {
  if (position < 1) return EMPTY_SEQUENCE;
  let index = 0;
  for (let item = stream.next(); item !== undefined; item = stream.next()) {
    index++;
    if (index === position) return [item];
  }
  return EMPTY_SEQUENCE;
}

/** `a ! b`: `b` for each item of `a`, in order. */
export function compileSimpleMap(map: SimpleMap, state: CompileState): Evaluator {
  const left = compile(map.left, state);
  const right = compile(map.right, state);
  if (anyPausable(left, right))
    return pausable((context) =>
      after(left(context), (items) => joinedInTurn(items.length, (index) => right(context.focusOn(items, index))))
    );
  return (context) => {
    const items = left(context);
    const size = items.length;
    const results: XdmItem[] = [];
    for (let index = 0; index < size; index++) {
      for (const item of right(context.withFocus(items[index] as XdmItem, index + 1, size))) results.push(item);
    }
    return results;
  };
}

/** The most integers a range may hold, as each is held in memory. */
const MAXIMUM_RANGE = 10_000_000n;

/** One end of a range: an integer, an untyped value cast to one, or empty. */
export function rangeEnd(value: XdmValue): bigint | undefined {
  const atomic = atomizeOptional(value, 'Each end of a range');
  if (atomic === undefined) return undefined;
  const integer = isUntyped(atomic) ? castAs(atomic, XS.integer) : atomic;
  if (!isIntegerType(integer.type))
    return dynamicError(
      XPathErrorCode.TYPE_MISMATCH,
      `A range's ends must be integers, not ${integer.type.toString()}`
    );
  return integer.value as bigint;
}

/** `a to b`: the integers from `a` to `b`, empty when `b` is less. */
export function compileRange(range: RangeExpression, state: CompileState): Evaluator {
  const left = compile(range.left, state);
  const right = compile(range.right, state);
  return (context) => {
    const from = rangeEnd(left(context));
    const to = rangeEnd(right(context));
    if (from === undefined || to === undefined || to < from) return EMPTY_SEQUENCE;
    if (to - from >= MAXIMUM_RANGE)
      return dynamicError(
        XPathErrorCode.IMPLEMENTATION_LIMIT,
        `The range ${from} to ${to} holds more than ${MAXIMUM_RANGE} integers`
      );
    const integers: XdmAtomicValue[] = [];
    for (let integer = from; integer <= to; integer++) integers.push(uncheckedAtomicValue(XS.integer, integer));
    return integers;
  };
}

/** One operand of `||` as a string: empty for the empty sequence. */
function concatenated(value: XdmValue): string {
  const atomic = atomizeOptional(value, 'Each operand of ||');
  return atomic === undefined ? '' : stringValueOf(atomic);
}

/** `a || b`. */
export function compileStringConcatenation(concatenation: StringConcatenation, state: CompileState): Evaluator {
  const left = compile(concatenation.left, state);
  const right = compile(concatenation.right, state);
  return (context) => [XdmAtomicValue.string(concatenated(left(context)) + concatenated(right(context)))];
}

/** A set operation's operand, which must be nodes. */
function nodesOf(value: XdmValue, operator: string): readonly XdmNode[] {
  if (value.some((item) => !isNode(item)))
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, `The operands of ${operator} must be nodes`);
  return inDocumentOrder(value as readonly XdmNode[]);
}

/** Whether a node is among nodes in document order. */
function contains(nodes: readonly XdmNode[], node: XdmNode): boolean {
  let low = 0;
  let high = nodes.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const order = compareOrder(nodes[middle] as XdmNode, node);
    if (order === 0) return true;
    if (order < 0) low = middle + 1;
    else high = middle - 1;
  }
  return false;
}

/** `a union b`, `a intersect b`, `a except b`, in document order without duplicates. */
export function compileSetOperation(operation: SetOperation, state: CompileState): Evaluator {
  const left = compile(operation.left, state);
  const right = compile(operation.right, state);
  const operator = operation.operator;
  return (context) => {
    const first = nodesOf(left(context), operator);
    const second = nodesOf(right(context), operator);
    if (operator === 'union') return inDocumentOrder([...first, ...second]);
    const keep = operator === 'intersect';
    return first.filter((node) => contains(second, node) === keep);
  };
}
