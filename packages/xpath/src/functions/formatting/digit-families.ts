import { Char } from '@exemplarjs/xml/internal';

/** The digits in a decimal digit family, zero to nine. */
export const DIGITS_PER_FAMILY = 10;

/** One character of Unicode category Nd, a decimal digit. */
const DECIMAL_DIGIT = /^\p{Nd}$/u;

/** Whether a character is a decimal digit of any script, Unicode category Nd. */
export function isDecimalDigit(character: string): boolean {
  return DECIMAL_DIGIT.test(character);
}

/**
 * The code point of the zero of a digit's family. Unicode assigns Nd digits in complete runs of
 * ten, zero first, so a digit's distance from the start of its run, modulo ten, is its value.
 *
 * @example
 * familyZero('٣'); // 0x660, ARABIC-INDIC DIGIT ZERO
 */
export function familyZero(digit: string): number {
  const codePoint = digit.codePointAt(0) as number;
  let runStart = codePoint;
  while (isDecimalDigit(String.fromCodePoint(runStart - 1))) runStart--;
  return codePoint - ((codePoint - runStart) % DIGITS_PER_FAMILY);
}

/** Text with its ASCII digits rewritten in the family whose zero is given; other characters stay. */
export function inFamily(text: string, zero: number): string {
  if (zero === Char.DIGIT_ZERO) return text;
  return text.replaceAll(/\d/g, (digit) =>
    String.fromCodePoint(zero + (digit.codePointAt(0) as number) - Char.DIGIT_ZERO)
  );
}
