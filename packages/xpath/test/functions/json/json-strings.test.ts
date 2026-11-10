import { describe, expect, it } from 'vitest';
import { decodeEscapes, keepEscapes } from '@/functions/json/json-strings';

/** The start of a `\uXXXX` escape, kept apart so that escapes stay as written. */
const U = String.raw`\u`;

describe('keeping escapes', () => {
  it('leaves text without backslashes or controls as it is', () => {
    expect(keepEscapes('abc')).toBe('abc');
  });

  it('writes the C1 controls as unicode escapes, escaped or not', () => {
    expect(keepEscapes(`${U}007F\u0085`)).toBe(`\\u007F\\u0085`);
  });

  it('writes backslashes and the controls with one-letter escapes as those', () => {
    expect(keepEscapes(String.raw`\\\b\f\n\r\t`)).toBe(String.raw`\\\b\f\n\r\t`);
    expect(keepEscapes(`${U}005C${U}0008${U}000a`)).toBe(String.raw`\\\b\n`);
  });

  it('writes characters XML can hold as themselves, even when they were escaped', () => {
    expect(keepEscapes(String.raw`\"\/` + `${U}0041${U}00e9${U}d83d${U}de00`)).toBe('"/A\u{E9}\u{1F600}');
  });

  it('writes characters XML cannot hold as unicode escapes in capitals', () => {
    expect(keepEscapes(`${U}0000${U}001f${U}ffff${U}dead`)).toBe(`${U}0000${U}001F${U}FFFF${U}DEAD`);
  });

  it('keeps a high surrogate not followed by a low surrogate escape as a lone surrogate', () => {
    expect(keepEscapes(`${U}d83d${U}0041`)).toBe(`${U}D83DA`);
    expect(keepEscapes(`${U}d83dx`)).toBe(`${U}D83Dx`);
  });

  it('reads an unescaped character outside the basic plane as one character', () => {
    expect(keepEscapes(String.raw`${'\u{1F600}'}\n`)).toBe(String.raw`${'\u{1F600}'}\n`);
  });
});

describe('decoding escapes', () => {
  const decode = decodeEscapes(undefined);

  it('leaves text without backslashes as it is', () => {
    expect(decode('abc')).toBe('abc');
  });

  it('decodes one-letter, unicode and surrogate pair escapes', () => {
    expect(decode(String.raw`\"\\\/\n\r\t`)).toBe('"\\/\n\r\t');
    expect(decode(`${U}0041${U}d83d${U}de00`)).toBe('A\u{1F600}');
  });

  it('replaces characters XML cannot hold with U+FFFD', () => {
    expect(decode(String.raw`a\b\f` + `${U}0000${U}ffff${U}dead`)).toBe('a\u{FFFD}\u{FFFD}\u{FFFD}\u{FFFD}\u{FFFD}');
  });

  it('gives the fallback the escape each such character was written with', () => {
    const fallback = decodeEscapes((written) => `[${written}]`);
    expect(fallback(String.raw`\b` + `${U}0001${U}d800${U}0041`)).toBe(String.raw`[\b]` + `[${U}0001][${U}d800]A`);
  });
});
