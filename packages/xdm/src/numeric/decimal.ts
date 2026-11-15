import { InvalidArgumentError } from '@exemplarjs/xml';
import { ErrorFactory } from '@exemplarjs/xml/internal';
import { XPathErrorCode, xdmError } from '@/errors';
import { doubleParts } from '@/numeric/double-layout';

/** A division keeps at least 18 places after the point and at least 18 significant digits, rounding half to even. */
const DIVISION_PLACES = 18;
const DIVISION_SIGNIFICANT_DIGITS = 18;

/** The most significant digits a result keeps, rounding half to even, so that precision cannot grow without bound. */
const MAX_SIGNIFICANT_DIGITS = 100;

/** The lexical form of `xs:decimal` (XML Schema Part 2, §3.2.3.1). */
const DECIMAL_LEXICAL = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** The powers of ten as bigints, made as needed. */
const POWERS_OF_TEN: bigint[] = [1n];

/** -1, 0 or 1 as one bigint is less than, equal to or greater than another. */
export function compareBigints(a: bigint, b: bigint): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** 10 to a power, as a bigint. */
export function powerOfTen(exponent: number): bigint {
  for (let power = POWERS_OF_TEN.length; power <= exponent; power++) {
    POWERS_OF_TEN.push((POWERS_OF_TEN[power - 1] as bigint) * 10n);
  }
  return POWERS_OF_TEN[exponent] as bigint;
}

/** The absolute value of a bigint. */
function magnitude(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** How many decimal digits a bigint has, ignoring its sign. */
function digitCount(value: bigint): number {
  return magnitude(value).toString().length;
}

/** How a number is rounded: half up toward positive infinity, as `fn:round` does; half to even; or always up or down. */
export type RoundingMode = 'half-up' | 'half-even' | 'ceiling' | 'floor';

/** A quotient rounded by a mode; the remainder is taken from the floor, so a negative quotient needs no mirror case. */
function roundedQuotient(dividend: bigint, divisor: bigint, mode: RoundingMode): bigint {
  if (divisor < 0n) return roundedQuotient(-dividend, -divisor, mode);
  let quotient = dividend / divisor;
  let remainder = dividend % divisor;
  if (remainder < 0n) {
    quotient--;
    remainder += divisor;
  }
  if (remainder === 0n || mode === 'floor') return quotient;
  const twice = 2n * remainder;
  const tie = twice === divisor;
  const up = mode === 'ceiling' || twice > divisor || (tie && (mode === 'half-up' || quotient % 2n !== 0n));
  return up ? quotient + 1n : quotient;
}

/**
 * An exact decimal number, as `xs:decimal` holds: a bigint of digits and how many of them come
 * after the point, so that `0.1 + 0.2` is exactly `0.3`.
 *
 * ```ts
 * Decimal.parse('0.1')?.add(Decimal.parse('0.2') as Decimal).toString(); // '0.3'
 * ```
 *
 * Values are kept with no trailing zeros after the point, so that equal values have equal parts.
 */
export class Decimal {
  /** The digits, without the point: 1.25 holds 125. */
  readonly digits: bigint;
  /** How many of the digits come after the point: 1.25 has 2. */
  readonly scale: number;

  /** Zero. */
  static readonly ZERO: Decimal = new Decimal(0n, 0);

  private constructor(digits: bigint, scale: number) {
    this.digits = digits;
    this.scale = scale;
  }

  /** A result of arithmetic: rounded half to even to at most 100 significant digits, but never into its integer part. */
  static #result(digits: bigint, scale: number): Decimal {
    // Below 10^100 a value has at most 100 digits, so it needs no rounding and no count of its digits.
    if (scale <= 0 || magnitude(digits) < powerOfTen(MAX_SIGNIFICANT_DIGITS)) return Decimal.of(digits, scale);
    const excess = Math.min(digitCount(digits) - MAX_SIGNIFICANT_DIGITS, scale);
    return Decimal.of(roundedQuotient(digits, powerOfTen(excess), 'half-even'), scale - excess);
  }

  /** A decimal of digits and a scale, with trailing zeros after the point removed. */
  static of(digits: bigint, scale = 0): Decimal {
    let normalized = digits;
    let normalizedScale = scale;
    while (normalizedScale > 0 && normalized % 10n === 0n) {
      normalized /= 10n;
      normalizedScale--;
    }
    return normalizedScale < 0
      ? new Decimal(normalized * powerOfTen(-normalizedScale), 0)
      : new Decimal(normalized, normalizedScale);
  }

  /** The decimal a lexical form such as `-1.50` or `.5` stands for, or undefined when it is not one. */
  static parse(text: string): Decimal | undefined {
    const match = DECIMAL_LEXICAL.exec(text);
    if (match === null) return undefined;
    const [, sign = '', whole = '', fraction = ''] = match;
    if (whole === '' && fraction === '') return undefined;
    const digits = BigInt(`${whole}${fraction}`);
    return Decimal.of(sign === '-' ? -digits : digits, fraction.length);
  }

  /** The decimal a lexical form such as `-1.50` stands for; an InvalidArgumentError when it is not one. */
  static from(text: string): Decimal {
    const decimal = Decimal.parse(text);
    if (decimal === undefined) throw ErrorFactory.create(InvalidArgumentError, `${text} is not a decimal number`);
    return decimal;
  }

  /** The decimal closest to a finite number: the one its shortest decimal form names. */
  static fromNumber(value: number): Decimal {
    if (!Number.isFinite(value)) return xdmError(XPathErrorCode.NOT_A_FINITE_NUMBER, `${value} is not a finite number`);
    const [mantissa = '0', exponent = '0'] = String(Math.abs(value)).split('e');
    const parsed = Decimal.parse(mantissa) as Decimal;
    const shift = Number(exponent);
    const shifted = Decimal.of(parsed.digits, parsed.scale - shift);
    return value < 0 ? shifted.negate() : shifted;
  }

  /**
   * The decimal a finite number holds, as every double is a binary fraction: 0.1 is
   * 0.1000000000000000055511151231257827021181583404541015625. Like every decimal result it keeps
   * at most 100 significant digits, never rounding its integer part.
   */
  static exactly(value: number): Decimal {
    if (!Number.isFinite(value)) return xdmError(XPathErrorCode.NOT_A_FINITE_NUMBER, `${value} is not a finite number`);
    const [significand, exponent] = doubleParts(value);
    const isWhole = exponent >= 0;
    // m × 2^-k is m × 5^k / 10^k: k decimal places.
    const digits = isWhole ? significand << BigInt(exponent) : significand * 5n ** BigInt(-exponent);
    const scale = isWhole ? 0 : -exponent;
    return Decimal.#result(value < 0 ? -digits : digits, scale);
  }

  /** Whether the value is zero. */
  isZero(): boolean {
    return this.digits === 0n;
  }

  /** Whether the value has no fraction. */
  isInteger(): boolean {
    return this.scale === 0;
  }

  /** -1, 0 or 1 as the value is negative, zero or positive. */
  sign(): number {
    return compareBigints(this.digits, 0n);
  }

  /** The integer part, truncated toward zero. */
  truncate(): bigint {
    return this.digits / powerOfTen(this.scale);
  }

  negate(): Decimal {
    return new Decimal(-this.digits, this.scale);
  }

  /** This decimal's digits at a larger or equal scale. */
  #digitsAt(scale: number): bigint {
    return this.digits * powerOfTen(scale - this.scale);
  }

  add(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    return Decimal.#result(this.#digitsAt(scale) + other.#digitsAt(scale), scale);
  }

  subtract(other: Decimal): Decimal {
    return this.add(other.negate());
  }

  multiply(other: Decimal): Decimal {
    return Decimal.#result(this.digits * other.digits, this.scale + other.scale);
  }

  /** The quotient to at least 18 places and 18 significant digits, rounded half to even; raises FOAR0001 for division by zero. */
  divide(other: Decimal): Decimal {
    if (other.isZero()) return xdmError(XPathErrorCode.DIVISION_BY_ZERO, 'Decimal division by zero');
    // The quotient has at least this many digits before the point, or this many fewer zeros after it when negative.
    const quotientMagnitude = digitCount(this.digits) - this.scale - (digitCount(other.digits) - other.scale);
    const significantScale = DIVISION_SIGNIFICANT_DIGITS - quotientMagnitude;
    const scale = Math.max(DIVISION_PLACES, significantScale, this.scale, other.scale);
    // digits / 10^s1 ÷ (d2 / 10^s2) = digits × 10^(scale + s2 - s1) / d2, at `scale`.
    const shift = scale + other.scale - this.scale;
    return Decimal.#result(roundedQuotient(this.digits * powerOfTen(shift), other.digits, 'half-even'), scale);
  }

  /** The quotient truncated toward zero, as `idiv` gives it; raises FOAR0001 for division by zero. */
  integerDivide(other: Decimal): bigint {
    if (other.isZero()) return xdmError(XPathErrorCode.DIVISION_BY_ZERO, 'Integer division by zero');
    const scale = Math.max(this.scale, other.scale);
    return this.#digitsAt(scale) / other.#digitsAt(scale);
  }

  /** The remainder, with the sign of the dividend, as `mod` gives it; raises FOAR0001 for division by zero. */
  modulo(other: Decimal): Decimal {
    if (other.isZero()) return xdmError(XPathErrorCode.DIVISION_BY_ZERO, 'Modulus by zero');
    const scale = Math.max(this.scale, other.scale);
    return Decimal.#result(this.#digitsAt(scale) % other.#digitsAt(scale), scale);
  }

  /** The decimal rounded to a number of places after the point, which may be negative to round to tens, hundreds and so on. */
  round(places: number, mode: RoundingMode): Decimal {
    if (this.scale <= places) return this;
    const quotient = roundedQuotient(this.digits, powerOfTen(this.scale - places), mode);
    return places >= 0 ? Decimal.of(quotient, places) : Decimal.of(quotient * powerOfTen(-places), 0);
  }

  /** Negative, zero or positive as this is less than, equal to or greater than another. */
  compare(other: Decimal): number {
    const scale = Math.max(this.scale, other.scale);
    return compareBigints(this.#digitsAt(scale), other.#digitsAt(scale));
  }

  /** The nearest double. */
  toNumber(): number {
    return Number(this.toString());
  }

  /** The canonical form XPath casts to a string: `1.5`, `-0.25`, or an integer such as `2` without a point. */
  toString(): string {
    const text = magnitude(this.digits).toString();
    const sign = this.digits < 0n ? '-' : '';
    if (this.scale === 0) return `${sign}${text}`;
    const padded = text.padStart(this.scale + 1, '0');
    return `${sign}${padded.slice(0, -this.scale)}.${padded.slice(-this.scale)}`;
  }
}

/** The absolute value of a decimal. */
export function absoluteDecimal(value: Decimal): Decimal {
  return value.sign() < 0 ? value.negate() : value;
}
