import { BYTE_BITS, BYTE_MASK, HEX_DIGITS_PER_BYTE, Radix, upperHex } from '@exemplarjs/xml/internal';

/** The lexical form of `xs:hexBinary`: pairs of hexadecimal digits. */
const HEX_LEXICAL = /^(?:[0-9a-fA-F]{2})*$/;

/** The pieces of `xs:base64Binary`'s grammar (XML Schema Part 2, §3.2.16), named as it names them. */
const B64 = '[A-Za-z0-9+/]';
const B64S = `${B64} ?`;
/** The characters that may come before one `=`, and before two, which leave the unused bits zero. */
const B16S = '[AEIMQUYcgkosw048] ?';
const B04S = '[AQgw] ?';

/** The lexical form of `xs:base64Binary` once collapsed: groups of four, single spaces allowed between characters. */
const BASE64_LEXICAL = new RegExp(
  `^(?:(?:${B64S}){4})*(?:(?:${B64S}){3}${B64}|(?:${B64S}){2}${B16S}=|${B64S}${B04S}= ?=)?$`
);

/** The base64 alphabet, by value. */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** The bits each base64 character holds, and their mask. */
const BASE64_CHARACTER_BITS = 6;
const BASE64_CHARACTER_MASK = (1 << BASE64_CHARACTER_BITS) - 1;
/** Base64 writes each group of three bytes as four characters. */
const BASE64_GROUP_BYTES = 3;
const BASE64_GROUP_CHARACTERS = 4;

/** Each character's value in base64, by code unit. */
const BASE64_VALUES = new Map(BASE64_ALPHABET.split('').map((character, index) => [character, index]));

/** The bytes a lexical form of `xs:hexBinary` names, or undefined when it is not one. */
export function parseHex(text: string): Uint8Array | undefined {
  if (!HEX_LEXICAL.test(text)) return undefined;
  const bytes = new Uint8Array(text.length / HEX_DIGITS_PER_BYTE);
  for (let i = 0; i < bytes.length; i++) {
    const start = i * HEX_DIGITS_PER_BYTE;
    bytes[i] = Number.parseInt(text.slice(start, start + HEX_DIGITS_PER_BYTE), Radix.HEXADECIMAL);
  }
  return bytes;
}

/** Bytes as the canonical form of `xs:hexBinary`: upper-case hexadecimal digits. */
export function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => upperHex(byte, HEX_DIGITS_PER_BYTE)).join('');
}

/** The bytes a collapsed lexical form of `xs:base64Binary` names, or undefined when it is not one. */
export function parseBase64(text: string): Uint8Array | undefined {
  if (!BASE64_LEXICAL.test(text)) return undefined;
  const characters = text.replaceAll(' ', '').replaceAll('=', '');
  const bytes = new Uint8Array(Math.floor((characters.length * BASE64_CHARACTER_BITS) / BYTE_BITS));
  let bits = 0;
  let bitCount = 0;
  let next = 0;
  for (const character of characters) {
    bits = (bits << BASE64_CHARACTER_BITS) | (BASE64_VALUES.get(character) as number);
    bitCount += BASE64_CHARACTER_BITS;
    if (bitCount >= BYTE_BITS) {
      bitCount -= BYTE_BITS;
      bytes[next++] = (bits >> bitCount) & BYTE_MASK;
    }
  }
  return bytes;
}

/** Bytes as the canonical form of `xs:base64Binary`: no whitespace, padded with `=`. */
export function formatBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += BASE64_GROUP_BYTES) {
    // The group's bytes as one number, missing bytes as zero.
    let group = 0;
    for (let offset = 0; offset < BASE64_GROUP_BYTES; offset++) group = (group << BYTE_BITS) | (bytes[i + offset] ?? 0);
    const present = Math.min(BASE64_GROUP_BYTES, bytes.length - i);
    for (let character = 0; character < BASE64_GROUP_CHARACTERS; character++) {
      const shift = (BASE64_GROUP_CHARACTERS - 1 - character) * BASE64_CHARACTER_BITS;
      text += character <= present ? BASE64_ALPHABET[(group >> shift) & BASE64_CHARACTER_MASK] : '=';
    }
  }
  return text;
}

/** Negative, zero or positive as one byte sequence sorts before, equal to or after another, byte by byte. */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const difference = (a[i] as number) - (b[i] as number);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}
