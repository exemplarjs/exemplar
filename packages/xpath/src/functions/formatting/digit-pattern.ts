import type { Decimal } from '@exemplarjs/xdm';
import { dynamicError } from '@/api/xpath-exception';
import { characters } from '@/functions/core/values';
import { familyZero, inFamily, isDecimalDigit } from './digit-families.ts';

/** The sign of a digit that may be left out, in digit patterns and decimal formats. */
export const OPTIONAL_DIGIT = '#';

/** What a decimal digit pattern may hold: digits, `#` and characters that are neither letters nor numbers. */
const DIGIT_PATTERN_CHARACTERS = /^(?:\p{Nd}|#|[^\p{N}\p{L}])+$/u;

/**
 * A decimal digit pattern such as `#,##0` or `٠٠١`, as `format-integer` and the numeric components
 * of `format-date` read it (F&O §4.6.1): the digit family, how many digits are mandatory, and the
 * grouping separators, each placed by how many digit signs stand to its right.
 *
 * A pattern is regular when its separators are all one character at every multiple of one
 * interval, as in `#,##0`; a regular pattern repeats its separator to the left as far as the
 * number needs, so `#,##0` writes a million as `1,000,000`. An irregular one, such as
 * `#(000)000-000`, places only the separators it shows.
 */
export interface DigitPattern {
  /** The code point of the family's zero, such as `0x30` for ASCII digits. */
  readonly zero: number;
  readonly mandatoryDigits: number;
  /** Mandatory and optional digits together. */
  readonly digitSigns: number;
  /** The separators, by the count of digit signs to their right. */
  readonly separators: ReadonlyMap<number, string>;
  /** The interval a regular pattern repeats its separator at, or undefined for an irregular one. */
  readonly regularInterval: number | undefined;
}

/** Whether a picture token holds a decimal digit, which makes it a decimal digit pattern. */
export function hasDecimalDigit(token: string): boolean {
  return /\p{Nd}/u.test(token);
}

/** A pattern's separators and digit counts, read from the right; raises `errorCode` for a misplaced one. */
function readSeparators(chars: readonly string[], errorCode: string, shown: string): Map<number, string> {
  const separators = new Map<number, string>();
  let digitsToTheRight = 0;
  let previousWasSeparator = true;
  for (let index = chars.length - 1; index >= 0; index--) {
    const character = chars[index] as string;
    const isDigitSign = character === OPTIONAL_DIGIT || isDecimalDigit(character);
    if (isDigitSign) digitsToTheRight++;
    else if (previousWasSeparator) dynamicError(errorCode, `A grouping separator is misplaced in '${shown}'`);
    else separators.set(digitsToTheRight, character);
    previousWasSeparator = !isDigitSign;
  }
  if (previousWasSeparator) dynamicError(errorCode, `'${shown}' has a grouping separator at an end`);
  return separators;
}

/** The interval of regular grouping: one separator character at every multiple of the first position below the digit count. */
function regularIntervalOf(separators: ReadonlyMap<number, string>, digitSigns: number): number | undefined {
  if (separators.size === 0 || new Set(separators.values()).size > 1) return undefined;
  const interval = Math.min(...separators.keys());
  for (const position of separators.keys()) if (position % interval !== 0) return undefined;
  for (let position = interval; position < digitSigns; position += interval)
    if (!separators.has(position)) return undefined;
  return interval;
}

/**
 * Reads a decimal digit pattern, raising `errorCode` when it breaks the rules: a character that is
 * a letter or another kind of number, digits of two families, `#` after a mandatory digit, or a
 * separator at either end or beside another. Messages quote `shown`, the pattern as the picture
 * has it, which differs from `token` for a fraction read from its right.
 */
export function parseDigitPattern(token: string, errorCode: string, shown = token): DigitPattern {
  if (!DIGIT_PATTERN_CHARACTERS.test(token))
    return dynamicError(errorCode, `'${shown}' is not a decimal digit pattern`);
  const chars = characters(token);
  const digits = chars.filter((character) => isDecimalDigit(character));
  const zero = familyZero(digits[0] as string);
  if (digits.some((digit) => familyZero(digit) !== zero))
    dynamicError(errorCode, `'${shown}' mixes digits of different families`);
  const firstMandatory = chars.findIndex((character) => isDecimalDigit(character));
  if (chars.includes(OPTIONAL_DIGIT, firstMandatory))
    dynamicError(errorCode, `'${shown}' has optional digits on the wrong side of mandatory ones`);
  const separators = readSeparators(chars, errorCode, shown);
  const digitSigns = digits.length + chars.filter((character) => character === OPTIONAL_DIGIT).length;
  return digitPattern(zero, digits.length, digitSigns, separators);
}

/** A digit pattern from its parts, its regular grouping interval worked out. */
export function digitPattern(
  zero: number,
  mandatoryDigits: number,
  digitSigns: number,
  separators: ReadonlyMap<number, string>
): DigitPattern {
  return { zero, mandatoryDigits, digitSigns, separators, regularInterval: regularIntervalOf(separators, digitSigns) };
}

/** The digits before and after the point of a non-negative decimal, without leading or trailing zeros. */
export function decimalDigits(value: Decimal): { integer: string; fraction: string } {
  const [integer = '', fraction = ''] = value.toString().split('.');
  return { integer: integer === '0' ? '' : integer, fraction };
}

/** The separator a pattern puts at a position, counted in digits from the right, if any. */
function separatorAt(pattern: DigitPattern, position: number): string | undefined {
  const interval = pattern.regularInterval;
  if (interval !== undefined) return position % interval === 0 ? pattern.separators.get(interval) : undefined;
  return pattern.separators.get(position);
}

/**
 * ASCII digits written by a pattern: padded with zeros to at least `minimumDigits`, in the
 * pattern's family, with its separators wherever a digit stands to their left.
 *
 * @example
 * formatDigits('1500000', parseDigitPattern('#,##0', code)); // '1,500,000'
 */
export function formatDigits(digits: string, pattern: DigitPattern, minimumDigits = pattern.mandatoryDigits): string {
  const padded = inFamily(digits.padStart(minimumDigits, '0'), pattern.zero);
  const chars = characters(padded);
  let written = '';
  for (let position = 0; position < chars.length; position++) {
    const separator = position > 0 ? separatorAt(pattern, position) : undefined;
    written = `${chars[chars.length - 1 - position] as string}${separator ?? ''}${written}`;
  }
  return written;
}
