import { upperHex } from '@/util/numbers';

/** Code units the scanners and writers compare against, named for their characters. */
export const Char = {
  TAB: 0x09,
  LINE_FEED: 0x0a,
  CARRIAGE_RETURN: 0x0d,
  SPACE: 0x20,
  EXCLAMATION: 0x21,
  DOUBLE_QUOTE: 0x22,
  HASH: 0x23,
  PERCENT: 0x25,
  AMPERSAND: 0x26,
  APOSTROPHE: 0x27,
  LEFT_PAREN: 0x28,
  RIGHT_PAREN: 0x29,
  ASTERISK: 0x2a,
  PLUS: 0x2b,
  COMMA: 0x2c,
  HYPHEN: 0x2d,
  PERIOD: 0x2e,
  SLASH: 0x2f,
  DIGIT_ZERO: 0x30,
  DIGIT_NINE: 0x39,
  COLON: 0x3a,
  SEMICOLON: 0x3b,
  LESS_THAN: 0x3c,
  EQUALS: 0x3d,
  GREATER_THAN: 0x3e,
  QUESTION: 0x3f,
  UPPER_A: 0x41,
  UPPER_E: 0x45,
  UPPER_F: 0x46,
  UPPER_N: 0x4e,
  UPPER_Z: 0x5a,
  LEFT_BRACKET: 0x5b,
  RIGHT_BRACKET: 0x5d,
  UNDERSCORE: 0x5f,
  LOWER_A: 0x61,
  LOWER_F: 0x66,
  LOWER_X: 0x78,
  LOWER_Z: 0x7a,
  VERTICAL_BAR: 0x7c,
  /** The last printable ASCII character. */
  TILDE: 0x7e,
  DELETE: 0x7f,
  /** The first code unit beyond ASCII. */
  NON_ASCII: 0x80,
  /** NEL, a line end in XML 1.1. */
  NEXT_LINE: 0x85,
  /** The last C1 control. */
  C1_LAST: 0x9f,
  /** LS, a line end in XML 1.1. */
  LINE_SEPARATOR: 0x20_28,
  /** U+FEFF, the byte order mark. */
  BYTE_ORDER_MARK: 0xfe_ff,
  /** U+FFFE and U+FFFF, which no XML version allows. */
  NONCHARACTER_FFFE: 0xff_fe,
  NONCHARACTER_FFFF: 0xff_ff,
} as const;

/** The UTF-16 surrogate ranges, and the code points beyond the BMP that pairs of them encode. */
export const Unicode = {
  /** The last code point before the surrogates. */
  LAST_BEFORE_SURROGATES: 0xd7_ff,
  HIGH_SURROGATE_FIRST: 0xd8_00,
  HIGH_SURROGATE_LAST: 0xdb_ff,
  LOW_SURROGATE_FIRST: 0xdc_00,
  LOW_SURROGATE_LAST: 0xdf_ff,
  /** The first code point after the surrogates, which starts the private use area. */
  PRIVATE_USE_FIRST: 0xe0_00,
  /** The first code point beyond the BMP. */
  SUPPLEMENTARY_FIRST: 0x1_00_00,
  LAST_CODE_POINT: 0x10_ff_ff,
} as const;

/** How many UTF-16 code units a surrogate pair takes. */
export const SURROGATE_PAIR_LENGTH = 2;
/** How many hexadecimal digits write a UTF-16 code unit, as in `U+00A0` or `\u00A0`. */
export const CODE_UNIT_HEX_DIGITS = 4;

// Module-level constants, so V8 can inline them.
const { C1_LAST, CARRIAGE_RETURN, DELETE, LINE_FEED, NEXT_LINE, NONCHARACTER_FFFE, SPACE, TAB } = Char;
const {
  HIGH_SURROGATE_FIRST,
  HIGH_SURROGATE_LAST,
  LAST_BEFORE_SURROGATES,
  LAST_CODE_POINT,
  LOW_SURROGATE_FIRST,
  LOW_SURROGATE_LAST,
  PRIVATE_USE_FIRST,
  SUPPLEMENTARY_FIRST,
} = Unicode;

/** How many bits of a supplementary code point each surrogate carries. */
const SURROGATE_BITS = 10;
const SURROGATE_MASK = (1 << SURROGATE_BITS) - 1;

/**
 * Whether a code unit is either half of a surrogate pair. UTF-16 writes a code point beyond the
 * BMP as two code units: a high surrogate, then a low one.
 */
export function isSurrogate(unit: number): boolean {
  return unit >= HIGH_SURROGATE_FIRST && unit <= LOW_SURROGATE_LAST;
}

/** Whether a code unit can start a surrogate pair. */
export function isHighSurrogate(unit: number): boolean {
  return unit >= HIGH_SURROGATE_FIRST && unit <= HIGH_SURROGATE_LAST;
}

/** Whether a code unit can end a surrogate pair. */
export function isLowSurrogate(unit: number): boolean {
  return unit >= LOW_SURROGATE_FIRST && unit <= LOW_SURROGATE_LAST;
}

/** The code point a surrogate pair encodes. */
export function codePointOf(high: number, low: number): number {
  return ((high - HIGH_SURROGATE_FIRST) << SURROGATE_BITS) + (low - LOW_SURROGATE_FIRST) + SUPPLEMENTARY_FIRST;
}

/** The high surrogate UTF-16 writes first for a code point beyond the BMP: the upper bits of its offset past the BMP. */
export function highSurrogateOf(codePoint: number): number {
  return HIGH_SURROGATE_FIRST + ((codePoint - SUPPLEMENTARY_FIRST) >> SURROGATE_BITS);
}

/** The low surrogate UTF-16 writes second for a code point beyond the BMP: the lower bits of its offset past the BMP. */
export function lowSurrogateOf(codePoint: number): number {
  return LOW_SURROGATE_FIRST + ((codePoint - SUPPLEMENTARY_FIRST) & SURROGATE_MASK);
}

/** Whether a character is an ASCII decimal digit, `0` to `9`. */
export function isAsciiDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
}

/** Orders strings by code point, as XPath's codepoint collation does: -1, 0 or 1. */
export function byCodePoint(first: string, second: string): number {
  if (first === second) return 0;
  const length = Math.min(first.length, second.length);
  for (let i = 0; i < length; i++) {
    const left = first.codePointAt(i) as number;
    const right = second.codePointAt(i) as number;
    if (left !== right) return left < right ? -1 : 1;
    // A character beyond U+FFFF takes two units, and both strings have it: skip its second unit.
    if (left >= SUPPLEMENTARY_FIRST) i += SURROGATE_PAIR_LENGTH - 1;
  }
  return Math.sign(first.length - second.length);
}

/** Orders strings by UTF-16 code unit, as `sort()` does by default, whatever the locale. */
export function byCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** A code point as Unicode writes it, such as U+00A0. */
export function codePointLabel(codePoint: number): string {
  return `U+${upperHex(codePoint, CODE_UNIT_HEX_DIGITS)}`;
}

/**
 * Whether a code point is a Char, a character XML allows at all, in the given version
 * (XML 1.0 [2], XML 1.1 [2]). Both exclude surrogates, U+FFFE and U+FFFF; XML 1.0 also excludes
 * the C0 controls but tab, LF and CR, while XML 1.1 excludes only NUL.
 */
export function isChar(codePoint: number, version11: boolean): boolean {
  if (codePoint < SPACE) {
    if (version11) return codePoint > 0;
    return codePoint === TAB || codePoint === LINE_FEED || codePoint === CARRIAGE_RETURN;
  }
  return (
    codePoint <= LAST_BEFORE_SURROGATES ||
    (codePoint >= PRIVATE_USE_FIRST && codePoint < NONCHARACTER_FFFE) ||
    (codePoint >= SUPPLEMENTARY_FIRST && codePoint <= LAST_CODE_POINT)
  );
}

/**
 * Whether a code point is a RestrictedChar (XML 1.1 [2a]): a control character an XML 1.1 document
 * may hold only as a character reference, such as `&#x1;`.
 */
export function isRestrictedChar(codePoint: number): boolean {
  // [#x7F-#x84] | [#x86-#x9F]: DEL and the C1 controls but NEL.
  if (codePoint >= DELETE) return codePoint <= C1_LAST && codePoint !== NEXT_LINE;
  // [#x1-#x8] | [#xB-#xC] | [#xE-#x1F]: the C0 controls but NUL, tab, LF and CR.
  return (
    codePoint > 0 && codePoint < SPACE && codePoint !== TAB && codePoint !== LINE_FEED && codePoint !== CARRIAGE_RETURN
  );
}

/** Only the characters a public identifier may hold (PubidChar, §2.3 [13]). */
const PUBID_CHARS = /^[\n\r a-zA-Z0-9\-'()+,./:=?;!*#@$_%]*$/;

/** Whether every character of a public identifier is a PubidChar (§2.3 [13]). */
export function isPubidText(text: string): boolean {
  return PUBID_CHARS.test(text);
}

/** A character, or a lone surrogate, that is not a Char in XML 1.0 (XML 1.0 [2]). */
// oxlint-disable-next-line no-control-regex -- finding control characters is the point
const NOT_CHAR_XML_10 = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
/** A character, or a lone surrogate, that is not a Char in XML 1.1 (XML 1.1 [2]). */
// oxlint-disable-next-line no-control-regex -- finding control characters is the point
const NOT_CHAR_XML_11 = /[^\u0001-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

/** Whether text holds a character, or a lone surrogate, that is not a Char in the given XML version. */
export function holdsNonChar(text: string, version11: boolean): boolean {
  return (version11 ? NOT_CHAR_XML_11 : NOT_CHAR_XML_10).test(text);
}
