import { Decimal } from '@/numeric/decimal';
import { exactDecimal, toDouble, toFloat, toInteger } from '@/numeric/numeric-values';
import { type AtomicType, isIntegerType, XS } from '@/types/built-in-types';
import type { XdmAtomicValue } from '@/values/atomic-value';

/** A numeric value's effective boolean: false for zero and NaN. */
export function numberAsBoolean(value: XdmAtomicValue): boolean {
  const content = value.value;
  if (typeof content === 'bigint') return content !== 0n;
  if (content instanceof Decimal) return !content.isZero();
  return !Number.isNaN(content) && content !== 0;
}

/**
 * The content a numeric or boolean value has when cast to a numeric or boolean type (F&O §19.1.2):
 * truncated toward zero for an integer, rounded to the nearest double or float, and true for any
 * number but zero and NaN.
 */
export function castNumericContent(value: XdmAtomicValue, target: AtomicType): bigint | Decimal | number | boolean {
  switch (target.primitive) {
    case XS.boolean: {
      // A boolean cast to xs:boolean is returned unchanged before this, so the value is a number.
      return numberAsBoolean(value);
    }
    case XS.double: {
      return toDouble(value);
    }
    case XS.float: {
      return toFloat(value);
    }
    default: {
      return isIntegerType(target) ? toInteger(value) : exactDecimal(value);
    }
  }
}
