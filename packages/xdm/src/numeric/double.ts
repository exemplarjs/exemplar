import { doubleParts } from '@/numeric/double-layout';
import { Decimal } from './decimal.ts';

/** The lexical form of `xs:double` and `xs:float` apart from INF and NaN (XML Schema Part 2, §3.2.5.1). */
const FLOATING_LEXICAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** The range XPath writes doubles in without an exponent: from one millionth up to a million. */
const PLAIN_MINIMUM = 1e-6;
const PLAIN_LIMIT = 1e6;

/** The double a lexical form of `xs:double` names, or undefined when it is not one; `+INF` is allowed, as in XML Schema 1.1. */
export function parseDouble(text: string): number | undefined {
  if (text === 'INF' || text === '+INF') return Number.POSITIVE_INFINITY;
  if (text === '-INF') return Number.NEGATIVE_INFINITY;
  if (text === 'NaN') return Number.NaN;
  return FLOATING_LEXICAL.test(text) ? Number(text) : undefined;
}

/** The text of NaN, the infinities and the zeros, or undefined for other values. */
function specialText(value: number): string | undefined {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return 'INF';
  if (value === Number.NEGATIVE_INFINITY) return '-INF';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  return undefined;
}

/** A finite, non-zero double written as XPath writes it in scientific notation: `1.0E6`, `-1.5E-7`. */
export function scientific(value: number): string {
  const [mantissa = '', exponent = ''] = value.toExponential().split('e');
  const withFraction = mantissa.includes('.') ? mantissa : `${mantissa}.0`;
  return `${withFraction}E${exponent.replace('+', '')}`;
}

/**
 * A double as XPath casts it to a string: plain decimal notation from one millionth up to a
 * million (`0.5`, `100`), scientific notation outside it (`1.0E6`), and `INF`, `-INF`, `NaN`, `0`
 * and `-0`.
 */
export function doubleToString(value: number): string {
  const special = specialText(value);
  return special ?? formatNumber(value, Math.abs(value));
}

/** A finite number's digits in plain notation when `magnitude` is from one millionth up to a million, else scientific. */
export function formatNumber(digits: number, magnitude: number): string {
  if (magnitude >= PLAIN_MINIMUM && magnitude < PLAIN_LIMIT) return Decimal.fromNumber(digits).toString();
  return scientific(digits);
}

/** A finite double as an exact fraction of bigints, its denominator a power of two. */
export function doubleToFraction(value: number): [bigint, bigint] {
  const [significand, exponent] = doubleParts(value);
  const signed = value < 0 ? -significand : significand;
  return exponent >= 0 ? [signed << BigInt(exponent), 1n] : [signed, 1n << BigInt(-exponent)];
}
