import {
  atomicArithmetic,
  type AtomicType,
  castAs,
  compareAtomic,
  type ComparisonOptions,
  derivesFrom,
  EMPTY_SEQUENCE,
  isNumericType,
  XdmAtomicValue,
  XdmError,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { isStringLike, type NumericKind, numericKind } from '@exemplarjs/xdm/internal';
import { ErrorFactory } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { isNaNValue } from '@/runtime/atomic-equality';
import { untypedAsDouble } from '@/runtime/atomization';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { comparisonWith, defineWithCollation, integerResult } from './values.ts';

/** The type each numeric kind promotes to, indexed by {@link NumericKind}. */
const NUMERIC_TYPES: readonly AtomicType[] = [XS.integer, XS.decimal, XS.float, XS.double];

/** What `sum` and `avg` add up: numbers, or durations of one of the two ordered subtypes. */
function summable(values: readonly XdmAtomicValue[]): boolean {
  if (values.every((value) => isNumericType(value.type))) return true;
  return [XS.yearMonthDuration, XS.dayTimeDuration].some((type) => values.every((value) => value.type === type));
}

/** Values as aggregates take them: untyped values cast to doubles. */
function aggregated(values: XdmValue): XdmAtomicValue[] {
  return values.map((item) => untypedAsDouble(item as XdmAtomicValue));
}

/** The sum of a non-empty list of numbers or durations for `sum` or `avg`, by XPath addition; FORG0006 unless they add up. */
function total(items: XdmValue, name: string, context: DynamicContext): XdmAtomicValue {
  const values = aggregated(items);
  if (!summable(values))
    return dynamicError(
      XPathErrorCode.INVALID_ARGUMENT_TYPE,
      `${name}() takes numbers, or durations all of type xs:yearMonthDuration or all of xs:dayTimeDuration`
    );
  let sum = values[0] as XdmAtomicValue;
  for (let index = 1; index < values.length; index++)
    sum = atomicArithmetic('+', sum, values[index] as XdmAtomicValue, context.environment.implicitTimezone);
  return sum;
}

/**
 * Values made comparable for `max` and `min` (F&O 3.1 §14.4.3): each keeps its own type unless the
 * values have more than one primitive type, when strings and URIs become strings and numbers are promoted.
 */
function promotedForComparison(values: readonly XdmAtomicValue[]): XdmAtomicValue[] {
  const first = (values[0] as XdmAtomicValue).type.primitive;
  if (values.every((value) => value.type.primitive === first)) return [...values];
  if (values.every((value) => isNumericType(value.type))) {
    const target = NUMERIC_TYPES[Math.max(...values.map((value) => numericKind(value) as NumericKind))] as AtomicType;
    return values.map((value) => (value.type === target ? value : castAs(value, target)));
  }
  // Strings keep their own type, as QT3's fn-max-18 expects; only URIs become strings.
  if (values.every((value) => isStringLike(value.type)))
    return values.map((value) => (derivesFrom(value.type, XS.anyURI) ? castAs(value, XS.string) : value));
  // Mixed types that do not promote, which the comparison rejects with FORG0006.
  return [...values];
}

/** `fn:max` or `fn:min`: the greatest or least value, NaN when any is; FORG0006 for values that cannot be compared. */
function extreme(values: XdmValue, name: 'max' | 'min', options: ComparisonOptions): XdmValue {
  if (values.length === 0) return EMPTY_SEQUENCE;
  const greatest = name === 'max';
  const comparable = promotedForComparison(aggregated(values));
  let best = comparable[0] as XdmAtomicValue;
  try {
    for (const value of comparable) {
      const order = compareAtomic(value, best, true, options);
      if (greatest ? order > 0 : order < 0) best = value;
    }
  } catch (error) {
    ErrorFactory.expect(error, XdmError);
    return dynamicError(XPathErrorCode.INVALID_ARGUMENT_TYPE, `${name}() was given values that cannot be compared`);
  }
  // NaN is greater and less than everything, once every value is known to compare.
  return [comparable.find((value) => isNaNValue(value)) ?? best];
}

/** `fn:max` or `fn:min`, with and without a collation. */
function extremeFunctions(name: 'max' | 'min'): FunctionDefinition[] {
  return defineWithCollation(
    `fn:${name}($arg as xs:anyAtomicType*) as xs:anyAtomicType?`,
    ([values = []], context, collation) => extreme(values, name, comparisonWith(context, collation))
  );
}

/** The aggregate functions (F&O §14.4). */
export const AGGREGATE_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:sum($arg as xs:anyAtomicType*) as xs:anyAtomicType', ([values = []], context) =>
    values.length === 0 ? integerResult(0) : [total(values, 'sum', context)]
  ),
  defineFunction(
    'fn:sum($arg as xs:anyAtomicType*, $zero as xs:anyAtomicType?) as xs:anyAtomicType?',
    ([values = [], zero = []], context) => (values.length === 0 ? zero : [total(values, 'sum', context)])
  ),
  defineFunction('fn:avg($arg as xs:anyAtomicType*) as xs:anyAtomicType?', ([values = []], context) => {
    if (values.length === 0) return EMPTY_SEQUENCE;
    const sum = total(values, 'avg', context);
    const count = XdmAtomicValue.integer(values.length);
    return [atomicArithmetic('div', sum, count, context.environment.implicitTimezone)];
  }),
  ...extremeFunctions('max'),
  ...extremeFunctions('min'),
];
