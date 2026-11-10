import type { QName } from '@exemplarjs/xml';
import { byCodePoint } from '@exemplarjs/xml/internal';
import type { XMLGregorianCalendar } from '@/date-time/calendar';
import { compareCalendars, compareDurations } from '@/date-time/date-time-comparison';
import { timezoneFromOption } from '@/date-time/date-time-lexical';
import type { Duration } from '@/date-time/duration';
import { notComparable } from '@/errors';
import { compareBigints } from '@/numeric/decimal';
import { NumericKind, numericKind, toDecimal, toDouble, toFloat } from '@/numeric/numeric-values';
import { compareBytes } from '@/text/binary';
import { sameQName } from '@/text/qname-value';
import { isStringLike } from '@/text/string-values';
import { isCalendarType, isDurationType, XS } from '@/types/built-in-types';
import type { XdmAtomicValue } from '@/values/atomic-value';

/** The value comparison operators. */
export type ComparisonOperator = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

/** What a comparison may need beyond the two values. */
export interface ComparisonOptions {
  /** Minutes east of UTC that a date or time without a timezone is taken to be in; the machine's offset by default. */
  readonly implicitTimezone?: number;
  /** Compares two strings, as a collation does: negative, zero or positive; by code points by default. */
  // eslint-disable-next-line sonarjs/no-redundant-optional -- exactOptionalPropertyTypes tells an absent comparer from undefined
  readonly compareStrings?: ((a: string, b: string) => number) | undefined;
}

/** Compares two numbers, promoted to their common kind; NaN when either is NaN. */
function compareNumbers(a: XdmAtomicValue, b: XdmAtomicValue, kind: NumericKind): number {
  if (kind === NumericKind.INTEGER) {
    return compareBigints(a.value as bigint, b.value as bigint);
  }
  if (kind === NumericKind.DECIMAL) return toDecimal(a).compare(toDecimal(b));
  const single = kind === NumericKind.FLOAT;
  const left = single ? toFloat(a) : toDouble(a);
  const right = single ? toFloat(b) : toDouble(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.NaN;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Compares two dates and times, in the implicit timezone where they have none, or two durations; undefined for any other pair. */
function compareTemporal(
  a: XdmAtomicValue,
  b: XdmAtomicValue,
  ordered: boolean,
  options: ComparisonOptions
): number | undefined {
  if (isDurationType(a.type) && isDurationType(b.type))
    return compareDurations(a.value as Duration, b.value as Duration, ordered);
  if (!isCalendarType(a.type) || !isCalendarType(b.type)) return undefined;
  const timezone = timezoneFromOption(options.implicitTimezone);
  return compareCalendars(a.value as XMLGregorianCalendar, b.value as XMLGregorianCalendar, ordered, timezone);
}

/**
 * Compares two atomic values as XPath's value comparisons do: negative, zero or positive, or NaN
 * when a NaN makes them unordered. Text compares by code points or `compareStrings`,
 * `xs:untypedAtomic` as a string; numbers after promotion; booleans with false first; binary
 * values byte by byte; dates and times on the timeline, in the implicit timezone where they have
 * none; durations by their months and seconds; QNames only for equality, when `ordered` is false.
 * Any other pair raises XPTY0004.
 */
export function compareAtomic(
  a: XdmAtomicValue,
  b: XdmAtomicValue,
  ordered: boolean,
  options: ComparisonOptions = {}
): number {
  const leftKind = numericKind(a);
  const rightKind = numericKind(b);
  if (leftKind !== undefined && rightKind !== undefined)
    return compareNumbers(a, b, Math.max(leftKind, rightKind) as NumericKind);
  if (isStringLike(a.type) && isStringLike(b.type))
    return (options.compareStrings ?? byCodePoint)(a.value as string, b.value as string);
  const temporal = compareTemporal(a, b, ordered, options);
  if (temporal !== undefined) return temporal;
  const primitive = a.type.primitive;
  if (primitive !== b.type.primitive) return notComparable(a.type, b.type);
  if (primitive === XS.boolean) return Number(a.value) - Number(b.value);
  if (primitive === XS.hexBinary || primitive === XS.base64Binary) {
    return compareBytes(a.value as Uint8Array, b.value as Uint8Array);
  }
  if (!ordered && (primitive === XS.QName || primitive === XS.NOTATION)) {
    return sameQName(a.value as QName, b.value as QName) ? 0 : 1;
  }
  return notComparable(a.type, b.type);
}

/** Whether an order, as `compareAtomic` gives it, satisfies a value comparison operator; NaN satisfies only `ne`. */
export function orderSatisfies(order: number, operator: ComparisonOperator): boolean {
  switch (operator) {
    case 'eq': {
      return order === 0;
    }
    case 'ne': {
      return order !== 0;
    }
    case 'lt': {
      return order < 0;
    }
    case 'le': {
      return order <= 0;
    }
    case 'gt': {
      return order > 0;
    }
    default: {
      return order >= 0;
    }
  }
}

/** Applies a value comparison operator to two atomic values; any comparison with NaN is false but `ne`. */
export function valueCompare(
  a: XdmAtomicValue,
  b: XdmAtomicValue,
  operator: ComparisonOperator,
  options: ComparisonOptions = {}
): boolean {
  return orderSatisfies(compareAtomic(a, b, operator !== 'eq' && operator !== 'ne', options), operator);
}
