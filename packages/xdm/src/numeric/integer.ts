import { XPathErrorCode, xdmError } from '@/errors';
import type { AtomicType } from '@/types/built-in-types';

/** The lexical form of `xs:integer` (XML Schema Part 2, §3.3.13.1). */
const INTEGER_LEXICAL = /^[+-]?\d+$/;

/** The integer a lexical form such as `-012` names, or undefined when it is not one. */
export function parseInteger(text: string): bigint | undefined {
  return INTEGER_LEXICAL.test(text) ? BigInt(text) : undefined;
}

/** Whether an integer lies in the range a type's restriction allows, through every type it derives from. */
export function inIntegerRange(value: bigint, type: AtomicType): boolean {
  for (let current: AtomicType | null = type; current !== null; current = current.base) {
    const { minimum, maximum } = current.restriction;
    if (minimum !== undefined && value < minimum) return false;
    if (maximum !== undefined && value > maximum) return false;
  }
  return true;
}

/** The quotient truncated toward zero, as `idiv` gives it; raises FOAR0001 for division by zero. */
export function integerDivide(dividend: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return xdmError(XPathErrorCode.DIVISION_BY_ZERO, 'Integer division by zero');
  return dividend / divisor;
}

/** The remainder with the sign of the dividend, as `mod` gives it; raises FOAR0001 for division by zero. */
export function integerModulo(dividend: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return xdmError(XPathErrorCode.DIVISION_BY_ZERO, 'Modulus by zero');
  return dividend % divisor;
}
