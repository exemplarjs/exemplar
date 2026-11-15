import { XPathErrorCode, xdmError } from '@/errors';
import { XS } from '@/types/built-in-types';
import { uncheckedAtomicValue, type XdmAtomicValue } from '@/values/atomic-value';
import { Decimal } from './decimal.ts';
import { doubleToFraction } from './double.ts';
import { integerDivide, integerModulo } from './integer.ts';
import { NumericKind, numericKind, toDecimal, toDouble, toFloat } from './numeric-values.ts';

/** Results of arithmetic, valid by construction, so made without checks. */
function integerResult(value: bigint): XdmAtomicValue {
  return uncheckedAtomicValue(XS.integer, value);
}

function decimalResult(value: Decimal): XdmAtomicValue {
  return uncheckedAtomicValue(XS.decimal, value);
}

function doubleResult(value: number): XdmAtomicValue {
  return uncheckedAtomicValue(XS.double, value);
}

function floatResult(value: number): XdmAtomicValue {
  return uncheckedAtomicValue(XS.float, Math.fround(value));
}

/** The arithmetic operators on numbers. */
export type ArithmeticOperator = '+' | '-' | '*' | 'div' | 'idiv' | 'mod';

/** A value's numeric kind; a value that is not a number raises XPTY0004. */
function kindOf(value: XdmAtomicValue, operator: string): NumericKind {
  const kind = numericKind(value);
  if (kind === undefined) {
    return xdmError(
      XPathErrorCode.TYPE_MISMATCH,
      `${operator} needs numbers, not a value of type ${value.type.toString()}`
    );
  }
  return kind;
}

/** Integer arithmetic, exact; `div` gives a decimal. */
function integerArithmetic(operator: ArithmeticOperator, left: bigint, right: bigint): XdmAtomicValue {
  switch (operator) {
    case '+': {
      return integerResult(left + right);
    }
    case '-': {
      return integerResult(left - right);
    }
    case '*': {
      return integerResult(left * right);
    }
    case 'idiv': {
      return integerResult(integerDivide(left, right));
    }
    case 'mod': {
      return integerResult(integerModulo(left, right));
    }
    default: {
      return decimalArithmetic('div', Decimal.of(left), Decimal.of(right));
    }
  }
}

/** Decimal arithmetic, exact but for division, which keeps 18 digits after the point; `idiv` gives an integer. */
function decimalArithmetic(operator: ArithmeticOperator, left: Decimal, right: Decimal): XdmAtomicValue {
  switch (operator) {
    case '+': {
      return decimalResult(left.add(right));
    }
    case '-': {
      return decimalResult(left.subtract(right));
    }
    case '*': {
      return decimalResult(left.multiply(right));
    }
    case 'idiv': {
      return integerResult(left.integerDivide(right));
    }
    case 'mod': {
      return decimalResult(left.modulo(right));
    }
    default: {
      return decimalResult(left.divide(right));
    }
  }
}

/**
 * `idiv` of doubles or floats: the exact quotient truncated toward zero, the largest integer N
 * with |N × right| ≤ |left| (F&O §4.2.5); zero divisors raise FOAR0001, NaN and infinite dividends FOAR0002.
 */
function floatingIntegerDivide(left: number, right: number): XdmAtomicValue {
  if (right === 0) return xdmError(XPathErrorCode.DIVISION_BY_ZERO, 'Integer division by zero');
  if (!Number.isFinite(left) || Number.isNaN(right)) {
    return xdmError(XPathErrorCode.NUMERIC_OVERFLOW, `${left} idiv ${right} has no integer result`);
  }
  if (!Number.isFinite(right)) return integerResult(0n);
  // Both are exact binary fractions, so the quotient is exact: (an / ad) / (bn / bd) = (an × bd) / (ad × bn).
  const [dividendTop, dividendBottom] = doubleToFraction(left);
  const [divisorTop, divisorBottom] = doubleToFraction(right);
  return integerResult((dividendTop * divisorBottom) / (dividendBottom * divisorTop));
}

/**
 * Double or float arithmetic, as IEEE 754 does it. Float operations run on doubles and round the
 * result to single precision, which gives the float result exactly for these operations.
 */
function floatingArithmetic(
  operator: ArithmeticOperator,
  left: number,
  right: number,
  single: boolean
): XdmAtomicValue {
  if (operator === 'idiv') return floatingIntegerDivide(left, right);
  let result: number;
  if (operator === '+') result = left + right;
  else if (operator === '-') result = left - right;
  else if (operator === '*') result = left * right;
  else if (operator === 'div') result = left / right;
  // JavaScript's remainder keeps the dividend's sign, as XPath's mod does.
  else result = left % right;
  return single ? floatResult(result) : doubleResult(result);
}

/**
 * Applies an arithmetic operator to two numbers (F&O §4.2), with XPath's promotion: two integers
 * give an integer (but `div` a decimal), a decimal and an integer a decimal, then float, then
 * double. `idiv` always gives an integer.
 *
 * ```ts
 * numericArithmetic('div', integerResult(1n), integerResult(3n)).stringValue; // '0.333333333333333333'
 * ```
 */
export function numericArithmetic(
  operator: ArithmeticOperator,
  left: XdmAtomicValue,
  right: XdmAtomicValue
): XdmAtomicValue {
  const kind = Math.max(kindOf(left, operator), kindOf(right, operator));
  if (kind === NumericKind.INTEGER) return integerArithmetic(operator, left.value as bigint, right.value as bigint);
  if (kind === NumericKind.DECIMAL) return decimalArithmetic(operator, toDecimal(left), toDecimal(right));
  // Operands promoted to float are rounded to float before the operation.
  if (kind === NumericKind.FLOAT) return floatingArithmetic(operator, toFloat(left), toFloat(right), true);
  return floatingArithmetic(operator, toDouble(left), toDouble(right), false);
}

/** Negates a number, keeping its kind: unary minus. */
export function numericNegate(value: XdmAtomicValue): XdmAtomicValue {
  const kind = kindOf(value, 'Unary minus');
  if (kind === NumericKind.INTEGER) return integerResult(-(value.value as bigint));
  if (kind === NumericKind.DECIMAL) return decimalResult(toDecimal(value).negate());
  return kind === NumericKind.FLOAT ? floatResult(-toFloat(value)) : doubleResult(-toDouble(value));
}
