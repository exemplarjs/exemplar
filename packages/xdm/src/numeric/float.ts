import { Radix } from '@exemplarjs/xml/internal';
import { powerOfTen } from '@/numeric/decimal';
import { doubleToString, formatNumber, parseDouble } from './double.ts';

/** The bits of a float's significand, the implicit leading one included. */
const SIGNIFICAND_BITS = 24;
/** The first significand too large for a float, 2^24. */
const SIGNIFICAND_LIMIT = 1n << BigInt(SIGNIFICAND_BITS);
/** The exponent of the smallest subnormal float, 2^-149: no float has a finer unit. */
const SMALLEST_EXPONENT = -149;
/** The largest finite float, (2 - 2^-23) * 2^127. */
const LARGEST_FLOAT = 3.4028234663852886e38;

/** The most significant digits a float needs to be read back exactly. */
const FLOAT_DIGITS = 9;

/** Decimal exponents beyond which any value overflows to infinity or underflows to zero as a float. */
const OVERFLOW_DIGITS = 40;
const UNDERFLOW_DIGITS = -46;

/** The lexical form of `xs:float` apart from INF and NaN, with its sign, digits and exponent. */
const FLOAT_LEXICAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/** How many binary digits a positive bigint has. */
function bitLength(value: bigint): number {
  return value.toString(Radix.BINARY).length;
}

/** The quotient, remainder and scaled denominator of a fraction scaled by 2^-exponent. */
function scaledDivision(numerator: bigint, denominator: bigint, exponent: number): [bigint, bigint, bigint] {
  const scaledNumerator = exponent < 0 ? numerator << BigInt(-exponent) : numerator;
  const scaledDenominator = exponent > 0 ? denominator << BigInt(exponent) : denominator;
  return [scaledNumerator / scaledDenominator, scaledNumerator % scaledDenominator, scaledDenominator];
}

/**
 * The float nearest a positive fraction, rounding half to even once, as reading a decimal as
 * `xs:float` must; going through a double first can round twice and land on the wrong float.
 */
function positiveFractionToFloat(numerator: bigint, denominator: bigint): number {
  // An exponent that puts the quotient in [2^23, 2^25), one bit too many at worst, and never below 2^-149.
  let exponent = Math.max(bitLength(numerator) - bitLength(denominator) - SIGNIFICAND_BITS, SMALLEST_EXPONENT);
  let [quotient, remainder, scaledDenominator] = scaledDivision(numerator, denominator, exponent);
  if (quotient >= SIGNIFICAND_LIMIT)
    [quotient, remainder, scaledDenominator] = scaledDivision(numerator, denominator, ++exponent);
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder > scaledDenominator || (twiceRemainder === scaledDenominator && quotient % 2n === 1n)) quotient++;
  const value = Number(quotient) * Radix.BINARY ** exponent;
  return value > LARGEST_FLOAT ? Number.POSITIVE_INFINITY : value;
}

/** The float nearest a fraction of bigints with a positive denominator. */
export function fractionToFloat(numerator: bigint, denominator: bigint): number {
  if (numerator === 0n) return 0;
  return numerator < 0n
    ? -positiveFractionToFloat(-numerator, denominator)
    : positiveFractionToFloat(numerator, denominator);
}

/** The float a lexical form of `xs:float` names, rounded once to the nearest float; undefined when it is not one. */
export function parseFloat32(text: string): number | undefined {
  // Validity, INF, NaN and values beyond any double are as for doubles.
  const asDouble = parseDouble(text);
  if (asDouble === undefined || !Number.isFinite(asDouble)) return asDouble;
  const [, sign = '', whole = '', fraction = '', exponentText = '0'] = FLOAT_LEXICAL.exec(text) as RegExpExecArray;
  const digits = `${whole}${fraction}`.replace(/^0+/, '');
  const negative = sign === '-';
  const exponent = Number(exponentText) - fraction.length;
  // The value lies below 10^magnitude and at or above a tenth of it.
  const magnitude = digits.length + exponent;
  if (digits === '' || magnitude <= UNDERFLOW_DIGITS) return negative ? -0 : 0;
  if (magnitude > OVERFLOW_DIGITS) return negative ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  const significand = BigInt(digits);
  const value =
    exponent >= 0
      ? fractionToFloat(significand * powerOfTen(exponent), 1n)
      : fractionToFloat(significand, powerOfTen(-exponent));
  return negative ? -value : value;
}

/** The decimals of some significant digits nearest a value: the nearest, then one unit above and below in the last digit. */
function candidatesNear(value: number, digits: number): number[] {
  const [mantissa = '', exponent = '0'] = value.toExponential(digits - 1).split('e');
  const significand = BigInt(mantissa.replace('.', ''));
  const scale = Number(exponent) - (digits - 1);
  return [significand, significand + 1n, significand - 1n].map((candidate) => Number(`${candidate}e${scale}`));
}

/**
 * The shortest decimal form that reads back as the same float, as a double. At a power of two the
 * nearest decimal can miss while one a unit away reads back, so both are tried at each length.
 */
export function shortestFloat(value: number): number {
  for (let digits = 1; digits < FLOAT_DIGITS; digits++) {
    const found = candidatesNear(value, digits).find((candidate) => Math.fround(candidate) === value);
    if (found !== undefined) return found;
  }
  return Number(value.toPrecision(FLOAT_DIGITS));
}

/** A float as XPath casts it to a string: notation by the float's own value, with only the digits a float needs. */
export function floatToString(value: number): string {
  if (!Number.isFinite(value) || value === 0) return doubleToString(value);
  return formatNumber(shortestFloat(value), Math.abs(value));
}
