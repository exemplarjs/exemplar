import { type ComparisonOperator as ValueOperator, valueCompare, XdmAtomicValue, XS } from '@exemplarjs/xdm';
import { tryCastAs } from '@exemplarjs/xdm/internal';
import { atomize, untypedAsDouble } from '@/runtime/atomization';
import { booleanResult } from '@/runtime/boolean-value';
import type { Evaluator } from '@/runtime/dynamic-context';
import type { RangeExpression } from '@/syntax/syntax-tree';
import { rangeEnd } from './compile-sequences.ts';
import { compile, type CompileState } from './compiler.ts';

/** The operator with its operands swapped: `a < b` is `b > a`. */
const SWAPPED: Readonly<Record<ValueOperator, ValueOperator>> = {
  eq: 'eq',
  ne: 'ne',
  lt: 'gt',
  le: 'ge',
  gt: 'lt',
  ge: 'le',
};

/** Whether a number is a whole number; false for NaN, the infinities and fractions. */
function isInteger(value: XdmAtomicValue): boolean {
  const integer = tryCastAs(value, XS.integer);
  return integer !== undefined && valueCompare(value, integer, 'eq');
}

/** Whether some integer from `from` to `to` compares true with a value, `value operator integer`, decided from the bounds. */
function someInRange(value: XdmAtomicValue, operator: ValueOperator, from: bigint, to: bigint): boolean {
  const first = XdmAtomicValue.integer(from);
  const last = XdmAtomicValue.integer(to);
  // Comparing with the first integer raises XPTY0004 for a value that is not a number, as comparing with any would.
  const withFirst = valueCompare(value, first, operator);
  switch (operator) {
    case 'eq': {
      // Within the bounds as promoted, so a float or double compares as it would with each integer.
      return isInteger(value) && valueCompare(value, first, 'ge') && valueCompare(value, last, 'le');
    }
    case 'ne': {
      return withFirst || valueCompare(value, last, 'ne');
    }
    case 'lt':
    case 'le': {
      return valueCompare(value, last, operator);
    }
    default: {
      return withFirst;
    }
  }
}

/**
 * Compiles a general comparison with a range on one side, such as `$x = (1 to 1000000)`, into a
 * test against the range's bounds, without making its integers.
 */
export function compileRangeComparison(
  other: Evaluator,
  range: RangeExpression,
  operator: ValueOperator,
  rangeOnLeft: boolean,
  state: CompileState
): Evaluator {
  const left = compile(range.left, state);
  const right = compile(range.right, state);
  const comparison = rangeOnLeft ? SWAPPED[operator] : operator;
  return (context) => {
    const from = rangeEnd(left(context));
    const to = rangeEnd(right(context));
    if (from === undefined || to === undefined || to < from) return booleanResult(false);
    const values = atomize(other(context)).map((value) => untypedAsDouble(value));
    const found = values.some((value) => someInRange(value, comparison, from, to));
    return booleanResult(found);
  };
}
