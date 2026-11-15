import { Decimal, numericArithmetic, XdmAtomicValue, type XdmValue } from '@exemplarjs/xdm';
import { absoluteDecimal, toDecimal } from '@exemplarjs/xdm/internal';
import { trimWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { optionalAtomic, optionalString, stringArgument, stringResult } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineWithLast } from '@/functions/signatures';
import { inFamily } from './digit-families.ts';
import { decimalDigits, formatDigits } from './digit-pattern.ts';
import { type DecimalFormat, DEFAULT_DECIMAL_FORMAT, parseNumberPicture, type SubPicture } from './number-picture.ts';

/** Whether a number takes the negative sub-picture: below zero, or a negative zero double or float. */
function isNegative(number: XdmAtomicValue): boolean {
  const content = number.value as Decimal | bigint | number;
  if (content instanceof Decimal) return content.sign() < 0;
  return content < 0 || Object.is(content, -0);
}

/** Whether a number is a double or float that is NaN or infinite. */
function isNotFinite(number: XdmAtomicValue): boolean {
  return typeof number.value === 'number' && !Number.isFinite(number.value);
}

/** A finite number's magnitude as an exact decimal, a float by the digits a float needs. */
function magnitudeOf(number: XdmAtomicValue): Decimal {
  return absoluteDecimal(toDecimal(number));
}

/**
 * A non-negative decimal as a mantissa and an exponent of ten, the mantissa at least
 * 10^(integerDigits - 1) and below 10^integerDigits; zero has exponent zero.
 */
function withExponent(value: Decimal, integerDigits: number): { mantissa: Decimal; exponent: number } {
  if (value.isZero()) return { mantissa: value, exponent: 0 };
  const magnitude = value.digits.toString().length - value.scale;
  const exponent = magnitude - integerDigits;
  return { mantissa: Decimal.of(value.digits, value.scale + exponent), exponent };
}

/** The fraction digits with grouping separators at the given positions from the point. */
function groupFraction(digits: readonly string[], subPicture: SubPicture, separator: string): string {
  return digits
    .map((digit, index) => {
      const grouped = index > 0 && subPicture.fractionGrouping.includes(index);
      return grouped ? separator + digit : digit;
    })
    .join('');
}

/** A magnitude as a mantissa and exponent, the mantissa rounded half to even to the fraction digits the sub-picture allows. */
function roundedMantissa(value: Decimal, subPicture: SubPicture): { mantissa: Decimal; exponent: number } {
  const { mantissa, exponent } =
    subPicture.minimumExponentDigits === undefined
      ? { mantissa: value, exponent: 0 }
      : withExponent(value, subPicture.integer.mandatoryDigits);
  // Rounding comes after the exponent is chosen, so 0.99999999 with `0.0e0` is `10.0e-1`.
  return { mantissa: mantissa.round(subPicture.maximumFractionDigits, 'half-even'), exponent };
}

/** The digits of a finite number's magnitude as a sub-picture writes them, with its exponent if it has one. */
function writeFinite(value: Decimal, subPicture: SubPicture, format: DecimalFormat): string {
  const exponentDigits = subPicture.minimumExponentDigits;
  const { mantissa, exponent } = roundedMantissa(value, subPicture);
  const { integer, fraction } = decimalDigits(mantissa);
  const fractionDigits = Array.from(inFamily(fraction.padEnd(subPicture.minimumFractionDigits, '0'), format.zeroDigit));
  let written = formatDigits(integer, subPicture.integer, subPicture.minimumIntegerDigits);
  if (fractionDigits.length > 0)
    written += `${format.decimalSeparator}${groupFraction(fractionDigits, subPicture, format.groupingSeparator)}`;
  if (exponentDigits === undefined) return written;
  const sign = exponent < 0 ? format.minusSign : '';
  const exponentText = inFamily(String(Math.abs(exponent)).padStart(exponentDigits, '0'), format.zeroDigit);
  return `${written}${format.exponentSeparator}${sign}${exponentText}`;
}

/**
 * A number as a picture writes it in a decimal format (F&O §4.7.5): NaN as the format's NaN
 * string; a negative number by the negative sub-picture, or by the positive one after a minus
 * sign; rounded half to even to the fraction digits the picture allows.
 */
function formatNumber(number: XdmAtomicValue, picture: string, format: DecimalFormat): string {
  const { positive, negative } = parseNumberPicture(picture, format);
  if (Number.isNaN(number.value)) return format.notANumber;
  const negativeNumber = isNegative(number);
  const usesNegativePicture = negativeNumber && negative !== undefined;
  const subPicture = usesNegativePicture ? negative : positive;
  const addsMinusSign = negativeNumber && negative === undefined;
  const prefix = addsMinusSign ? `${format.minusSign}${subPicture.prefix}` : subPicture.prefix;
  // A percent or per-mille multiplies in the number's own type, so a double or float may overflow.
  const adjusted =
    subPicture.factor === 1 ? number : numericArithmetic('*', number, XdmAtomicValue.integer(subPicture.factor));
  const body = isNotFinite(adjusted) ? format.infinity : writeFinite(magnitudeOf(adjusted), subPicture, format);
  return `${prefix}${body}${subPicture.suffix}`;
}

/**
 * The decimal format a name names: the default one for an absent name. FODF1280 for any name,
 * valid or not, since no named decimal formats can be declared yet.
 */
function decimalFormatNamed(name: string | undefined): DecimalFormat {
  if (name === undefined) return DEFAULT_DECIMAL_FORMAT;
  return dynamicError(
    XPathErrorCode.UNKNOWN_DECIMAL_FORMAT,
    `There is no decimal format named '${trimWhitespace(name)}'`
  );
}

/** `fn:format-number`: a number as a picture writes it, in the default or a named decimal format. */
function formatNumberFunction(args: readonly XdmValue[], formatName: XdmValue | undefined): XdmValue {
  const format = decimalFormatNamed(optionalString(formatName));
  const number = optionalAtomic(args[0]) ?? XdmAtomicValue.double(Number.NaN);
  return stringResult(formatNumber(number, stringArgument(args[1]), format));
}

/** `fn:format-number` with and without a decimal format name (F&O §4.7.2). */
export const FORMAT_NUMBER_FUNCTIONS: readonly FunctionDefinition[] = [
  ...defineWithLast(
    'fn:format-number($value as xs:numeric?, $picture as xs:string) as xs:string',
    '$decimal-format-name as xs:string?',
    formatNumberFunction
  ),
];
