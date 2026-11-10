/**
 * The character sets of XSD regular expressions (XSD 1.1 Part 2 §G.4) as JavaScript `v`-mode
 * class text, and how to write single characters into JavaScript patterns. XSD's escapes mean
 * other things than JavaScript's: `\s` is only space, tab, LF and CR, `\w` is everything but
 * punctuation, separators and other characters, and `\p{IsGreek}` names a Unicode block, which
 * JavaScript has no property for. So `\d` becomes `\p{Nd}` and `\p{IsBasicLatin}` `[\u{0}-\u{7f}]`.
 */

import { Char, isSurrogate } from '@/util/chars';
import { Radix } from '@/util/numbers';
import { UNICODE_BLOCKS } from '@/util/unicode-blocks';

/** The general categories `\p{...}` accepts (XSD 1.1 Part 2 §G.4): every one but Cs. */
const CATEGORIES = new Set(
  'L Lu Ll Lt Lm Lo M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po Z Zs Zl Zp S Sm Sc Sk So C Cc Cf Co Cn'.split(' ')
);

/** XML's NameStartChar (XML 1.0 fifth edition [4]), as class items. */
const NAME_START_CHARS =
  String.raw`:A-Z_a-z\u{C0}-\u{D6}\u{D8}-\u{F6}\u{F8}-\u{2FF}\u{370}-\u{37D}\u{37F}-\u{1FFF}\u{200C}-\u{200D}` +
  String.raw`\u{2070}-\u{218F}\u{2C00}-\u{2FEF}\u{3001}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFFD}\u{10000}-\u{EFFFF}`;
/** The other characters of XML's NameChar (XML 1.0 fifth edition [4a]), as class items. */
const NAME_CHARS_BEYOND_START = String.raw`\-.0-9\u{B7}\u{300}-\u{36F}\u{203F}-\u{2040}`;

/** The multi-character escapes (XSD 1.1 Part 2 §G.4), by their letter, as JavaScript sets. */
const MULTI_CHAR_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['s', String.raw`[ \t\n\r]`],
  ['S', String.raw`[^ \t\n\r]`],
  ['i', `[${NAME_START_CHARS}]`],
  ['I', `[^${NAME_START_CHARS}]`],
  ['c', `[${NAME_START_CHARS}${NAME_CHARS_BEYOND_START}]`],
  ['C', `[^${NAME_START_CHARS}${NAME_CHARS_BEYOND_START}]`],
  ['d', String.raw`\p{Nd}`],
  ['D', String.raw`\P{Nd}`],
  ['w', String.raw`[^\p{P}\p{Z}\p{C}]`],
  ['W', String.raw`[\p{P}\p{Z}\p{C}]`],
]);

/**
 * Block names XSD 1.0 used that Unicode has since renamed, with the blocks they now name.
 * `PrivateUse` covered all three private use blocks.
 */
const LEGACY_BLOCKS: ReadonlyMap<string, readonly string[]> = new Map([
  ['Greek', ['GreekandCoptic']],
  ['CombiningMarksforSymbols', ['CombiningDiacriticalMarksforSymbols']],
  ['PrivateUse', ['PrivateUseArea', 'SupplementaryPrivateUseArea-A', 'SupplementaryPrivateUseArea-B']],
]);

/** A block name as `\p{IsX}` may spell it: letters, digits and hyphens (XSD 1.1 Part 2 §G.4, IsBlock). */
const BLOCK_NAME = /^[a-zA-Z0-9-]+$/;

/** Characters JavaScript reads as syntax outside a class, so a literal one is escaped. */
const SYNTAX_OUTSIDE_CLASS = new Set(String.raw`^$\.*+?()[]{}|/`);
/** Characters JavaScript's `v` mode reads as syntax, or as half of a doubled operator, inside a class. */
const SYNTAX_INSIDE_CLASS = new Set('^$\\.*+?()[]{}|/-&!#%,:;<=>@`~');

/** The JavaScript set for a multi-character escape such as `\s` or `\I`, undefined for another letter. */
export function multiCharEscape(letter: string): string | undefined {
  return MULTI_CHAR_ESCAPES.get(letter);
}

/** Whether a name is a general category `\p{...}` accepts, such as `Lu` or `N`. */
export function isCategory(name: string): boolean {
  return CATEGORIES.has(name);
}

/** Whether a name has the form of a block name, such as `BasicLatin` or `Latin-1Supplement`. */
export function isBlockName(name: string): boolean {
  return BLOCK_NAME.test(name);
}

/**
 * The code-point ranges of a Unicode block by its name with the spaces removed, as in
 * `\p{IsBasicLatin}`, or of a block XSD 1.0 named; undefined for a name neither knows.
 */
export function blockRanges(name: string): (readonly [first: number, last: number])[] | undefined {
  if (Object.hasOwn(UNICODE_BLOCKS, name)) return [UNICODE_BLOCKS[name] as readonly [number, number]];
  return LEGACY_BLOCKS.get(name)?.map((current) => UNICODE_BLOCKS[current] as readonly [number, number]);
}

/** A character written to stand for itself, escaped where JavaScript reads it as syntax, or as `\u{...}` when not plain. */
function writtenChar(codePoint: number, syntax: ReadonlySet<string>): string {
  const char = String.fromCodePoint(codePoint);
  // A backslash then the character; String.raw cannot write a backslash right before `${`.
  if (syntax.has(char)) return `\u005C${char}`;
  return isPlainChar(codePoint) ? char : String.raw`\u{${codePoint.toString(Radix.HEXADECIMAL)}}`;
}

/** A character written to stand for itself outside a class. */
export function patternChar(codePoint: number): string {
  return writtenChar(codePoint, SYNTAX_OUTSIDE_CLASS);
}

/** A character written to stand for itself inside a `v`-mode class. */
export function classChar(codePoint: number): string {
  return writtenChar(codePoint, SYNTAX_INSIDE_CLASS);
}

/** A range of characters as a class item, such as `a-z`. */
export function classRange(first: number, last: number): string {
  return `${classChar(first)}-${classChar(last)}`;
}

/** Whether a character can be written as itself: not a control character or a lone surrogate. */
function isPlainChar(codePoint: number): boolean {
  return codePoint >= Char.SPACE && codePoint !== Char.DELETE && !isSurrogate(codePoint);
}
