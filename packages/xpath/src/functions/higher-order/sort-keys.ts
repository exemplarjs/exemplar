import {
  compareAtomic,
  type ComparisonOptions,
  type XdmAtomicValue,
  type XdmFunction,
  type XdmValue,
} from '@exemplarjs/xdm';
import { collationOf, comparisonWith, onlyItem, optionalString } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction, withLastParameter } from '@/functions/signatures';
import { atomicEqual, isNaNValue } from '@/runtime/atomic-equality';
import { atomize } from '@/runtime/atomization';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { callFunction } from '@/runtime/function-items';
import { after, inTurn, type Pausable } from '@/runtime/pausing';

/** Compares two sort key values: equal as `deep-equal` has them, else by `lt`, NaN before every other value. */
function compareKeyValues(a: XdmAtomicValue, b: XdmAtomicValue, options: ComparisonOptions): number {
  if (atomicEqual(a, b, options)) return 0;
  if (isNaNValue(a)) return -1;
  if (isNaNValue(b)) return 1;
  return compareAtomic(a, b, true, options) < 0 ? -1 : 1;
}

/** Compares two sort keys, each a sequence of atomic values: at the first values that differ, else the shorter first. */
function compareKeys(a: readonly XdmAtomicValue[], b: readonly XdmAtomicValue[], options: ComparisonOptions): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const order = compareKeyValues(a[index] as XdmAtomicValue, b[index] as XdmAtomicValue, options);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

/**
 * Values in the order of their sort keys (F&O §15.5.4): each key the key function's result, or
 * the value atomized, compared by a collation; values with equal keys keep their order. XPTY0004
 * when two keys cannot be compared. `fn:sort` sorts single items, `array:sort` members.
 */
function sortValues(
  values: readonly XdmValue[],
  collation: XdmValue | undefined,
  key: XdmValue | undefined,
  context: DynamicContext
): Pausable<XdmValue[]> {
  const keyFunction = key === undefined ? undefined : onlyItem<XdmFunction>(key);
  const options = comparisonWith(context, collationOf(optionalString(collation), context));
  const keyOf = (index: number) => {
    const value = values[index] as XdmValue;
    return keyFunction === undefined ? value : callFunction(keyFunction, [value]);
  };
  // The keys are found first, each in turn, so that the sort itself never waits.
  return after(inTurn(values.length, keyOf), (keys) => {
    const keyed = values.map((value, index) => ({ value, key: atomize(keys[index] as XdmValue) }));
    keyed.sort((first, second) => compareKeys(first.key, second.key, options));
    return keyed.map(({ value }) => value);
  });
}

/**
 * A sort function with one, two and three arguments, `$collation as xs:string?` and then a key
 * function of a type added to the first signature: the values to sort read from its first argument,
 * and its result made from them sorted.
 */
export function defineSorts(
  signature: string,
  keyType: string,
  valuesOf: (input: XdmValue | undefined) => readonly XdmValue[],
  resultOf: (sorted: XdmValue[]) => XdmValue
): FunctionDefinition[] {
  const collated = withLastParameter(signature, '$collation as xs:string?');
  return [signature, collated, withLastParameter(collated, `$key as ${keyType}`)].map((text) =>
    defineFunction(text, ([input, collation, key], context) =>
      after(sortValues(valuesOf(input), collation, key, context), resultOf)
    )
  );
}
