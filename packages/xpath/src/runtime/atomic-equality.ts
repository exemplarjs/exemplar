import { compareAtomic, type ComparisonOptions, type XdmAtomicValue, XdmError } from '@exemplarjs/xdm';
import { ErrorFactory } from '@exemplarjs/xml/internal';

/** Whether a value is NaN, as a double or float. */
export function isNaNValue(value: XdmAtomicValue): boolean {
  return typeof value.value === 'number' && Number.isNaN(value.value);
}

/**
 * Whether two atomic values are equal as `distinct-values` and `deep-equal` compare
 * them: by `eq`, with NaN equal to itself, and values that cannot be compared unequal.
 */
export function atomicEqual(a: XdmAtomicValue, b: XdmAtomicValue, options: ComparisonOptions): boolean {
  if (isNaNValue(a) && isNaNValue(b)) return true;
  return strictlyEqual(a, b, options);
}

/** Whether two atomic values are equal by `eq`, NaN equal to nothing, and values that cannot be compared unequal. */
export function strictlyEqual(a: XdmAtomicValue, b: XdmAtomicValue, options: ComparisonOptions): boolean {
  try {
    return compareAtomic(a, b, false, options) === 0;
  } catch (error) {
    ErrorFactory.expect(error, XdmError);
    return false;
  }
}
