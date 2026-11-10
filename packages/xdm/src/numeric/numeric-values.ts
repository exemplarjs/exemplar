import { XPathErrorCode, xdmError } from '@/errors';
import { isIntegerType, XS } from '@/types/built-in-types';
import type { XdmAtomicValue } from '@/values/atomic-value';
import { Decimal, powerOfTen } from './decimal.ts';
import { fractionToFloat, shortestFloat } from './float.ts';

/**
 * The kinds of number, in the order XPath promotes them when two meet: an integer and a decimal
 * give a decimal, anything and a float a float, anything and a double a double.
 */
export const NumericKind = { INTEGER: 0, DECIMAL: 1, FLOAT: 2, DOUBLE: 3 } as const;

export type NumericKind = (typeof NumericKind)[keyof typeof NumericKind];

/** A numeric value's kind, or undefined for a value that is not a number. */
export function numericKind(value: XdmAtomicValue): NumericKind | undefined {
  const primitive = value.type.primitive;
  if (primitive === XS.double) return NumericKind.DOUBLE;
  if (primitive === XS.float) return NumericKind.FLOAT;
  if (primitive !== XS.decimal) return undefined;
  return isIntegerType(value.type) ? NumericKind.INTEGER : NumericKind.DECIMAL;
}

/** A numeric or boolean value as the nearest double. */
export function toDouble(value: XdmAtomicValue): number {
  const content = value.value;
  if (typeof content === 'boolean') return content ? 1 : 0;
  if (typeof content === 'bigint') return Number(content);
  return content instanceof Decimal ? content.toNumber() : (content as number);
}

/** A numeric or boolean value as the nearest float, rounded once from its exact value. */
export function toFloat(value: XdmAtomicValue): number {
  const content = value.value;
  if (typeof content === 'boolean') return content ? 1 : 0;
  if (typeof content === 'bigint') return fractionToFloat(content, 1n);
  if (content instanceof Decimal) return fractionToFloat(content.digits, powerOfTen(content.scale));
  return Math.fround(content as number);
}

/** A double that must be finite to become a decimal or an integer; NaN and the infinities raise FOCA0002. */
function finite(value: number): number {
  return Number.isFinite(value) ? value : xdmError(XPathErrorCode.NOT_A_FINITE_NUMBER, `${value} has no decimal value`);
}

/** A numeric or boolean value as a decimal, a float by the digits a float needs; NaN and the infinities raise FOCA0002. */
export function toDecimal(value: XdmAtomicValue): Decimal {
  const content = value.value;
  if (content instanceof Decimal) return content;
  if (typeof content === 'bigint') return Decimal.of(content);
  if (typeof content === 'boolean') return Decimal.of(content ? 1n : 0n);
  const number = finite(content as number);
  return Decimal.fromNumber(value.type.primitive === XS.float ? shortestFloat(number) : number);
}

/** A numeric or boolean value as the decimal it holds exactly, a float or double as its binary fraction, as casting gives it; NaN and the infinities raise FOCA0002. */
export function exactDecimal(value: XdmAtomicValue): Decimal {
  const content = value.value;
  return typeof content === 'number' ? Decimal.exactly(content) : toDecimal(value);
}

/** A numeric or boolean value as an integer, truncated toward zero; NaN and the infinities raise FOCA0002. */
export function toInteger(value: XdmAtomicValue): bigint {
  const content = value.value;
  if (typeof content === 'bigint') return content;
  if (typeof content === 'boolean') return content ? 1n : 0n;
  if (content instanceof Decimal) return content.truncate();
  return BigInt(Math.trunc(finite(content as number)));
}
