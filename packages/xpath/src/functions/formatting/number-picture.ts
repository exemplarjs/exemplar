import { Char } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { characters } from '@/functions/core/values';
import { DIGITS_PER_FAMILY } from './digit-families.ts';
import { type DigitPattern, digitPattern, OPTIONAL_DIGIT } from './digit-pattern.ts';

/**
 * The properties of a decimal format (F&O §4.7.2): the characters a `format-number` picture is
 * read with, and the strings it writes for infinity, NaN and the minus sign. Only the default
 * format exists until the static context can declare named ones.
 */
export interface DecimalFormat {
  readonly decimalSeparator: string;
  readonly groupingSeparator: string;
  readonly exponentSeparator: string;
  readonly percent: string;
  readonly perMille: string;
  /** The code point of the zero of the digit family, whose ten digits are the mandatory digits. */
  readonly zeroDigit: number;
  readonly digit: string;
  readonly patternSeparator: string;
  readonly minusSign: string;
  readonly infinity: string;
  readonly notANumber: string;
}

/** The default decimal format, whose properties F&O §4.7.2 gives. */
export const DEFAULT_DECIMAL_FORMAT: DecimalFormat = {
  decimalSeparator: '.',
  groupingSeparator: ',',
  exponentSeparator: 'e',
  percent: '%',
  perMille: '\u2030',
  zeroDigit: Char.DIGIT_ZERO,
  digit: OPTIONAL_DIGIT,
  patternSeparator: ';',
  minusSign: '-',
  infinity: 'Infinity',
  notANumber: 'NaN',
};

/** The factors a percent and a per-mille sign scale a number by. */
const PERCENT_FACTOR = 100;
const PER_MILLE_FACTOR = 1000;
/** The most sub-pictures a picture holds: a positive one and a negative one. */
const MAX_SUB_PICTURES = 2;

/**
 * One sub-picture of a `format-number` picture, analysed as F&O §4.7.4 says: what to write before
 * and after the number, how many digits each part has at least and at most, where the grouping
 * separators go, and the factor of a percent or per-mille sign.
 *
 * @example
 * // '#,##0.00%': minimumIntegerDigits 1, fraction digits 2 to 2, a separator every 3 integer digits, factor 100
 */
export interface SubPicture {
  readonly prefix: string;
  readonly suffix: string;
  /** The integer part as a digit pattern: its mandatory digits set the mantissa's size when there is an exponent. */
  readonly integer: DigitPattern;
  readonly minimumIntegerDigits: number;
  /** The fraction's separators, by the count of digit signs to their left. */
  readonly fractionGrouping: readonly number[];
  readonly minimumFractionDigits: number;
  readonly maximumFractionDigits: number;
  /** The fewest digits of the exponent, or undefined when there is no exponent. */
  readonly minimumExponentDigits: number | undefined;
  /** 100 for a percent sign, 1000 for per-mille, else 1. */
  readonly factor: number;
}

/** A picture's sub-pictures: for positive numbers, and the one for negatives when it has one. */
interface NumberPicture {
  readonly positive: SubPicture;
  readonly negative: SubPicture | undefined;
}

/** The roles a character of a sub-picture plays. */
type Role = 'mandatory' | 'optional' | 'decimal' | 'grouping' | 'exponent' | 'passive';

/** A sub-picture's characters, each with its role, and where its first and last active characters are. */
interface ClassifiedCharacters {
  readonly chars: readonly string[];
  readonly roles: readonly Role[];
  readonly firstActive: number;
  readonly lastActive: number;
}

/** FODF1310 for a sub-picture that breaks a rule. */
function invalidNumberPicture(subPicture: string, reason: string): never {
  return dynamicError(XPathErrorCode.INVALID_NUMBER_PICTURE, `The picture '${subPicture}' ${reason}`);
}

/** A character's role, before exponent separators are told apart from passive characters. */
function roleOf(character: string, format: DecimalFormat): Role {
  const offset = (character.codePointAt(0) as number) - format.zeroDigit;
  if (offset >= 0 && offset < DIGITS_PER_FAMILY) return 'mandatory';
  if (character === format.digit) return 'optional';
  if (character === format.decimalSeparator) return 'decimal';
  return character === format.groupingSeparator ? 'grouping' : 'passive';
}

/** Whether a role is that of an active character, which the number's digits are written by. */
function isActive(role: Role): boolean {
  return role !== 'passive';
}

/**
 * The roles of a sub-picture's characters. An exponent separator counts as one only with active
 * characters both before and after it in the sub-picture; else it is passive. At most one may.
 */
function classify(subPicture: string, format: DecimalFormat): ClassifiedCharacters {
  const chars = characters(subPicture);
  const roles = chars.map((character) => roleOf(character, format));
  const firstActive = roles.findIndex((role) => isActive(role));
  const lastActive = roles.findLastIndex((role) => isActive(role));
  const exponents: number[] = [];
  for (const [index, character] of chars.entries())
    if (character === format.exponentSeparator && index > firstActive && index < lastActive) exponents.push(index);
  if (exponents.length > 1) invalidNumberPicture(subPicture, 'has more than one exponent separator');
  for (const index of exponents) roles[index] = 'exponent';
  return { chars, roles, firstActive, lastActive };
}

/** Counts the characters of a part that have a role. */
function count(roles: readonly Role[], wanted: Role): number {
  return roles.filter((role) => role === wanted).length;
}

/** Checks the grouping separators of a mantissa: never beside another or the decimal separator, nor ending the integer part. */
function checkGrouping(subPicture: string, mantissa: readonly Role[]): void {
  for (let index = 0; index < mantissa.length; index++) {
    if (mantissa[index] !== 'grouping') continue;
    const next = mantissa[index + 1];
    if (next === 'grouping' || next === 'decimal' || mantissa[index - 1] === 'decimal')
      invalidNumberPicture(subPicture, 'has a grouping separator beside another or the decimal separator');
    if (next === undefined && !mantissa.includes('decimal'))
      invalidNumberPicture(subPicture, 'ends its integer part with a grouping separator');
  }
}

/** Checks that no mandatory digit comes before an optional one in the integer part, nor after one in the fraction. */
function checkDigitOrder(subPicture: string, integerPart: readonly Role[], fractionPart: readonly Role[]): void {
  const firstMandatory = integerPart.indexOf('mandatory');
  if (firstMandatory !== -1 && integerPart.includes('optional', firstMandatory))
    invalidNumberPicture(subPicture, 'has an optional digit after a mandatory one in its integer part');
  const firstOptional = fractionPart.indexOf('optional');
  if (firstOptional !== -1 && fractionPart.includes('mandatory', firstOptional))
    invalidNumberPicture(subPicture, 'has a mandatory digit after an optional one in its fraction');
}

/** The positions of the separators in a part, counting digit signs from its start. */
function groupingPositions(part: readonly Role[]): number[] {
  const positions: number[] = [];
  let digits = 0;
  for (const role of part) {
    if (role === 'grouping') positions.push(digits);
    else digits++;
  }
  return positions;
}

/** The factor a sub-picture's percent or per-mille sign scales by; FODF1310 for more than one such sign. */
function factorOf(subPicture: string, chars: readonly string[], format: DecimalFormat): number {
  const percents = chars.filter((character) => character === format.percent).length;
  const perMilles = chars.filter((character) => character === format.perMille).length;
  if (percents + perMilles > 1) invalidNumberPicture(subPicture, 'has more than one percent or per-mille sign');
  if (percents === 1) return PERCENT_FACTOR;
  return perMilles === 1 ? PER_MILLE_FACTOR : 1;
}

/** The digit sizes after the adjustments of F&O §4.7.4 for a picture with too few mandatory digits. */
function adjustedSizes(
  integerPart: readonly Role[],
  fractionPart: readonly Role[],
  hasExponent: boolean
): { minimumIntegerDigits: number; minimumFractionDigits: number; maximumFractionDigits: number } {
  let minimumIntegerDigits = count(integerPart, 'mandatory');
  let minimumFractionDigits = count(fractionPart, 'mandatory');
  let maximumFractionDigits = minimumFractionDigits + count(fractionPart, 'optional');
  if (minimumIntegerDigits === 0 && maximumFractionDigits === 0) {
    if (hasExponent) minimumFractionDigits = maximumFractionDigits = 1;
    else minimumIntegerDigits = 1;
  }
  if (hasExponent && minimumIntegerDigits === 0 && integerPart.includes('optional')) minimumIntegerDigits = 1;
  if (minimumIntegerDigits === 0 && minimumFractionDigits === 0) minimumFractionDigits = 1;
  return { minimumIntegerDigits, minimumFractionDigits, maximumFractionDigits };
}

/** The integer part of a sub-picture as a digit pattern in the format's digits and grouping separator. */
function integerPattern(integerPart: readonly Role[], format: DecimalFormat): DigitPattern {
  const positions = groupingPositions(integerPart.toReversed());
  const separators = new Map(positions.map((position) => [position, format.groupingSeparator]));
  const mandatoryDigits = count(integerPart, 'mandatory');
  const digitSigns = mandatoryDigits + count(integerPart, 'optional');
  return digitPattern(format.zeroDigit, mandatoryDigits, digitSigns, separators);
}

/** Roles split around the first of a role: all of them before it and none after when it is absent. */
function splitAt(roles: readonly Role[], role: Role): [before: readonly Role[], after: readonly Role[]] {
  const at = roles.indexOf(role);
  return at === -1 ? [roles, []] : [roles.slice(0, at), roles.slice(at + 1)];
}

/** Analyses one sub-picture; FODF1310 when it breaks a rule of F&O §4.7.3. */
function analyse(subPicture: string, format: DecimalFormat): SubPicture {
  const { chars, roles, firstActive, lastActive } = classify(subPicture, format);
  const active = roles.slice(firstActive, lastActive + 1);
  if (firstActive === -1 || active.includes('passive'))
    invalidNumberPicture(subPicture, 'needs its digits together, with no other characters among them');
  const hasExponent = active.includes('exponent');
  const [mantissa, exponentPart] = splitAt(active, 'exponent');
  if (!mantissa.includes('mandatory') && !mantissa.includes('optional'))
    invalidNumberPicture(subPicture, 'has no digits');
  if (count(mantissa, 'decimal') > 1) invalidNumberPicture(subPicture, 'has more than one decimal separator');
  if (exponentPart.some((role) => role !== 'mandatory'))
    invalidNumberPicture(subPicture, 'has an exponent that is not all digits');
  const factor = factorOf(subPicture, chars, format);
  if (hasExponent && factor !== 1)
    invalidNumberPicture(subPicture, 'has both an exponent and a percent or per-mille sign');
  checkGrouping(subPicture, mantissa);
  const [integerPart, fractionPart] = splitAt(mantissa, 'decimal');
  checkDigitOrder(subPicture, integerPart, fractionPart);
  return {
    prefix: chars.slice(0, firstActive).join(''),
    suffix: chars.slice(lastActive + 1).join(''),
    integer: integerPattern(integerPart, format),
    fractionGrouping: groupingPositions(fractionPart),
    minimumExponentDigits: hasExponent ? exponentPart.length : undefined,
    factor,
    ...adjustedSizes(integerPart, fractionPart, hasExponent),
  };
}

/**
 * Reads a `format-number` picture: one sub-picture, or two separated by the pattern separator,
 * the second for negative numbers. FODF1310 for a picture that breaks the rules.
 *
 * @example
 * parseNumberPicture('#,##0.00;(#,##0.00)', DEFAULT_DECIMAL_FORMAT).negative?.prefix; // '('
 */
export function parseNumberPicture(picture: string, format: DecimalFormat): NumberPicture {
  const parts = picture.split(format.patternSeparator);
  if (parts.length > MAX_SUB_PICTURES) invalidNumberPicture(picture, 'has more than one pattern separator');
  const [positive, negative] = parts as [string, string | undefined];
  return {
    positive: analyse(positive, format),
    negative: negative === undefined ? undefined : analyse(negative, format),
  };
}
