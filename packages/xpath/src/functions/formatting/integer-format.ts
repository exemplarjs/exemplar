import { Char } from '@exemplarjs/xml/internal';
import { type DigitPattern, digitPattern, formatDigits, hasDecimalDigit, parseDigitPattern } from './digit-pattern.ts';
import { cardinalWords, ordinalSuffix, ordinalWords } from './english-words.ts';

/**
 * The primary format tokens `format-integer` and the components of `format-date` share (F&O
 * §4.6.1), read once and then used to write any number of integers:
 *
 * - a decimal digit pattern such as `001` or `#,##0`;
 * - `a` or `A` for letters (`a`, `b`, … `z`, `aa`), and `α` or `Α` for the Greek alphabet;
 * - `i` or `I` for roman numerals;
 * - `w`, `W` or `Ww` for English words in lower, upper or title case.
 *
 * Any other token stands for `1`, as the spec asks of a numbering sequence a processor lacks;
 * a number a sequence cannot write, such as zero in letters, is written in digits instead.
 *
 * @example
 * formatInteger(14n, parsePrimaryToken('I', code), { ordinal: false }); // 'XIV'
 */
export type PrimaryToken =
  | { readonly kind: 'decimal'; readonly pattern: DigitPattern }
  | { readonly kind: 'alphabetic'; readonly letters: readonly string[] }
  | { readonly kind: 'roman'; readonly upperCase: boolean }
  | { readonly kind: 'words'; readonly letterCase: LetterCase };

/** How words are capitalized: `w`, `W` and `Ww`. */
type LetterCase = 'lower' | 'upper' | 'title';

/** What else shapes a number: whether it is an ordinal, and the fewest digits a digit pattern writes. */
export interface IntegerStyle {
  readonly ordinal: boolean;
  readonly minimumDigits?: number;
}

/** A format modifier, as regular expression source: `c` or `o` with an optional `(…)` variant, then `a` or `t` (F&O §4.6.1). */
export const FORMAT_MODIFIER = String.raw`(?:[co](?:\(.+\))?)?[at]?`;

/** The token `1`: ASCII digits, as many as the number needs. */
const DECIMAL_TOKEN: PrimaryToken = { kind: 'decimal', pattern: digitPattern(Char.DIGIT_ZERO, 1, 1, new Map()) };

/** The alphabets of the letter tokens, each by its first letter; Greek leaves out the final sigma. */
const ALPHABETS: ReadonlyMap<string, readonly string[]> = new Map(
  ['abcdefghijklmnopqrstuvwxyz', 'αβγδεζηθικλμνξοπρστυφχψω'].flatMap((letters) => [
    [letters[0] as string, Array.from(letters)],
    [(letters[0] as string).toUpperCase(), Array.from(letters.toUpperCase())],
  ])
);

/** The tokens that are words or roman numerals. */
const NAMED_TOKENS: ReadonlyMap<string, PrimaryToken> = new Map([
  ['i', { kind: 'roman', upperCase: false }],
  ['I', { kind: 'roman', upperCase: true }],
  ['w', { kind: 'words', letterCase: 'lower' }],
  ['W', { kind: 'words', letterCase: 'upper' }],
  ['Ww', { kind: 'words', letterCase: 'title' }],
]);

/** Roman numerals' values and symbols, largest first, with the subtractive pairs. */
const ROMAN_NUMERALS: readonly (readonly [bigint, string])[] = [
  [1000n, 'm'],
  [900n, 'cm'],
  [500n, 'd'],
  [400n, 'cd'],
  [100n, 'c'],
  [90n, 'xc'],
  [50n, 'l'],
  [40n, 'xl'],
  [10n, 'x'],
  [9n, 'ix'],
  [5n, 'v'],
  [4n, 'iv'],
  [1n, 'i'],
];

/** The largest number roman numerals write without a symbol beyond `m`. */
const ROMAN_LIMIT = 3999n;

/** Whether a token writes English words: `w`, `W` or `Ww`. */
export function isWordsToken(token: string | undefined): boolean {
  return token !== undefined && NAMED_TOKENS.get(token)?.kind === 'words';
}

/** Whether a token is one this module writes, rather than one standing for `1`. */
export function isPrimaryToken(token: string): boolean {
  return hasDecimalDigit(token) || NAMED_TOKENS.has(token) || ALPHABETS.has(token);
}

/** Reads a primary format token; `errorCode` is raised for a malformed decimal digit pattern. */
export function parsePrimaryToken(token: string, errorCode: string): PrimaryToken {
  if (hasDecimalDigit(token)) return { kind: 'decimal', pattern: parseDigitPattern(token, errorCode) };
  const named = NAMED_TOKENS.get(token);
  if (named !== undefined) return named;
  const letters = ALPHABETS.get(token);
  return letters === undefined ? DECIMAL_TOKEN : { kind: 'alphabetic', letters };
}

/** A positive number in letters: `a` to `z`, then `aa`, `ab` and so on. */
function inLetters(value: bigint, letters: readonly string[]): string {
  const base = BigInt(letters.length);
  let written = '';
  for (let rest = value; rest > 0n; rest = (rest - 1n) / base)
    written = `${letters[Number((rest - 1n) % base)] as string}${written}`;
  return written;
}

/** A number from 1 to 3999 in lower-case roman numerals. */
function inRomanNumerals(value: bigint): string {
  let written = '';
  let rest = value;
  for (const [numeral, symbol] of ROMAN_NUMERALS) {
    for (; rest >= numeral; rest -= numeral) written += symbol;
  }
  return written;
}

/** Words in a letter case: title case capitalizes each word, including those after a hyphen. */
export function inLetterCase(words: string, letterCase: LetterCase): string {
  if (letterCase === 'upper') return words.toUpperCase();
  if (letterCase === 'lower') return words;
  return words.replaceAll(
    /(^|[\s-])(\p{Ll})/gu,
    (_match, before: string, letter: string) => `${before}${letter.toUpperCase()}`
  );
}

/** A non-negative number as a token writes it, or undefined when the token cannot write it. */
function writeMagnitude(value: bigint, token: PrimaryToken, style: IntegerStyle): string | undefined {
  switch (token.kind) {
    case 'decimal': {
      const digits = formatDigits(String(value), token.pattern, style.minimumDigits);
      return style.ordinal ? `${digits}${ordinalSuffix(value)}` : digits;
    }
    case 'alphabetic': {
      return value > 0n ? inLetters(value, token.letters) : undefined;
    }
    case 'roman': {
      if (value < 1n || value > ROMAN_LIMIT) return undefined;
      const numerals = inRomanNumerals(value);
      return token.upperCase ? numerals.toUpperCase() : numerals;
    }
    case 'words': {
      const words = style.ordinal ? ordinalWords(value) : cardinalWords(value);
      return words === undefined ? undefined : inLetterCase(words, token.letterCase);
    }
  }
}

/** An integer as a token writes it, a negative one after a minus sign; in digits when the token cannot write it. */
export function formatInteger(value: bigint, token: PrimaryToken, style: IntegerStyle): string {
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  const written = writeMagnitude(magnitude, token, style) ?? writeMagnitude(magnitude, DECIMAL_TOKEN, style);
  return `${sign}${written}`;
}
