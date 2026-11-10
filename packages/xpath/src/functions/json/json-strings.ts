import {
  CODE_UNIT_HEX_DIGITS,
  codePointOf,
  isChar,
  isHighSurrogate,
  isLowSurrogate,
  Radix,
  SURROGATE_PAIR_LENGTH,
  upperHex,
} from '@exemplarjs/xml/internal';
import type { StringDecoder } from './json-parser.ts';

/** The characters the one-letter escapes stand for. */
const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/** The one-letter escapes characters are written with: each short escape the other way round. */
const WRITTEN_ESCAPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SHORT_ESCAPES).map(([letter, character]) => [character, `\\${letter}`])
);

/** The start of a `\uXXXX` escape, the length of one and of a surrogate pair of them, and of a one-letter escape. */
const UNICODE_ESCAPE_PREFIX = String.raw`\u`;
const UNICODE_ESCAPE_LENGTH = UNICODE_ESCAPE_PREFIX.length + CODE_UNIT_HEX_DIGITS;
const PAIRED_ESCAPE_LENGTH = SURROGATE_PAIR_LENGTH * UNICODE_ESCAPE_LENGTH;
const SHORT_ESCAPE_LENGTH = 2;

/** The characters `escape: true` writes as escapes besides those XML cannot hold: backslashes and the C0 and C1 controls. */
// oxlint-disable-next-line no-control-regex -- finding control characters is the point
const SPECIAL = /[\\\u0000-\u001F\u007F-\u009F]/;
/** What a string must hold for decoding to change it: a backslash, a surrogate, or U+FFFE or U+FFFF, which XML cannot hold. */
const DECODED = /[\\\uD800-\uDFFF\uFFFE\uFFFF]/;

/** One character of a JSON string, decoded: its code point, and the text it was written with. */
interface DecodedCharacter {
  readonly codePoint: number;
  readonly written: string;
}

/** A JSON escape after its backslash, as regular expression source: a one-letter escape or `uXXXX`. */
export const ESCAPE_BODY = String.raw`(?:["\\/bfnrt]|u[\dA-Fa-f]{4})`;
/** The characters besides backslashes written as escapes, as regular expression class source: quotes, solidi and the controls. */
export const ESCAPED_CHARACTERS = String.raw`"/\u0000-\u001F\u007F-\u009F`;

/** The characters written as escapes in a string that holds none: backslashes and the escaped characters. */
const NEEDS_ESCAPE = new RegExp(String.raw`[\\${ESCAPED_CHARACTERS}]`, 'g');

/** The string each level of indented output is indented with, in JSON and XML alike. */
export const INDENT = '  ';

/** How JSON is laid out: on one line, or indented with a line for each member, at a depth of nesting. */
export interface Layout {
  readonly indent: boolean;
  readonly depth: number;
}

/** Text as a JSON string, between quotes, with the quotes, backslashes, solidi and controls in it escaped. */
export function quotedJSON(text: string): string {
  return `"${text.replaceAll(NEEDS_ESCAPE, escapeCharacter)}"`;
}

/** Members joined into a JSON object or array, between its brackets, laid out as asked. */
export function joinedJSON(members: readonly string[], open: string, close: string, layout: Layout): string {
  if (!layout.indent || members.length === 0) return `${open}${members.join(',')}${close}`;
  const inner = `\n${INDENT.repeat(layout.depth + 1)}`;
  const separator = `,${inner}`;
  return `${open}${inner}${members.join(separator)}\n${INDENT.repeat(layout.depth)}${close}`;
}

/** A character as JSON writes it escaped: by its one-letter escape when it has one, else as `\uXXXX`, in capitals. */
export function escapeCharacter(character: string): string {
  const codePoint = character.codePointAt(0) as number;
  return WRITTEN_ESCAPES[character] ?? UNICODE_ESCAPE_PREFIX + upperHex(codePoint, CODE_UNIT_HEX_DIGITS);
}

/** The code unit a `\uXXXX` escape at an offset gives, or undefined when there is none there. */
function unicodeEscapeAt(raw: string, offset: number): number | undefined {
  if (!raw.startsWith(UNICODE_ESCAPE_PREFIX, offset)) return undefined;
  const digits = raw.slice(offset + UNICODE_ESCAPE_PREFIX.length, offset + UNICODE_ESCAPE_LENGTH);
  return Number.parseInt(digits, Radix.HEXADECIMAL);
}

/** The character at an offset of a string's raw content: an escape decoded, a surrogate pair as one, a lone surrogate on its own. */
function characterAt(raw: string, offset: number): DecodedCharacter {
  const unit = unicodeEscapeAt(raw, offset);
  if (unit !== undefined) {
    const low = isHighSurrogate(unit) ? unicodeEscapeAt(raw, offset + UNICODE_ESCAPE_LENGTH) : undefined;
    const paired = low !== undefined && isLowSurrogate(low);
    const writtenLength = paired ? PAIRED_ESCAPE_LENGTH : UNICODE_ESCAPE_LENGTH;
    const written = raw.slice(offset, offset + writtenLength);
    return { codePoint: paired ? codePointOf(unit, low) : unit, written };
  }
  if (raw.charAt(offset) === '\\') {
    const decoded = SHORT_ESCAPES[raw.charAt(offset + 1)] as string;
    return { codePoint: decoded.codePointAt(0) as number, written: raw.slice(offset, offset + SHORT_ESCAPE_LENGTH) };
  }
  const codePoint = raw.codePointAt(offset) as number;
  return { codePoint, written: String.fromCodePoint(codePoint) };
}

/** The characters of a string's raw content, escapes decoded. */
function decodeCharacters(raw: string): DecodedCharacter[] {
  const characters: DecodedCharacter[] = [];
  for (let offset = 0; offset < raw.length;) {
    const character = characterAt(raw, offset);
    characters.push(character);
    offset += character.written.length;
  }
  return characters;
}

/**
 * The decoder for `escape: true`: escapes are kept, written one way each: a backslash as `\\`,
 * the controls with one-letter escapes as those, and the other controls and any character XML
 * cannot hold as `\uXXXX`; every other character, escaped or not, as itself.
 */
export const keepEscapes: StringDecoder = (raw) => {
  if (!SPECIAL.test(raw) && !DECODED.test(raw)) return raw;
  let text = '';
  for (const { codePoint } of decodeCharacters(raw)) {
    const character = String.fromCodePoint(codePoint);
    const escapes = SPECIAL.test(character) || !isChar(codePoint, false);
    text += escapes ? escapeCharacter(character) : character;
  }
  return text;
};

/**
 * The decoder for `escape: false`: escapes are decoded, and a character XML cannot hold, escaped
 * or not, is replaced by what `fallback` gives for its escape, or by U+FFFD.
 */
export function decodeEscapes(fallback: ((written: string) => string) | undefined): StringDecoder {
  return (raw) => {
    if (!DECODED.test(raw)) return raw;
    let text = '';
    for (const { codePoint, written } of decodeCharacters(raw)) {
      const character = String.fromCodePoint(codePoint);
      if (isChar(codePoint, false)) text += character;
      else if (fallback === undefined) text += '\uFFFD';
      else text += fallback(written.startsWith('\\') ? written : escapeCharacter(character));
    }
    return text;
  };
}
