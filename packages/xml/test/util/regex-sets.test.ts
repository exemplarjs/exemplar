import { describe, expect, it } from 'vitest';
import { isNameChar, isNameStartChar } from '@/util/names';
import {
  blockRanges,
  classChar,
  classRange,
  isBlockName,
  isCategory,
  multiCharEscape,
  patternChar,
} from '@/util/regex-sets';

/** A JavaScript set that matches exactly one character. */
const exactly = (set: string): RegExp => new RegExp(`^${set}$`, 'v');

describe('multiCharEscape (XSD 1.1 Part 2 §G.4)', () => {
  it('gives a set for each escape letter, and nothing for others', () => {
    for (const letter of 'sSiIcCdDwW') expect(multiCharEscape(letter)).toBeTypeOf('string');
    expect(multiCharEscape('b')).toBeUndefined();
    expect(multiCharEscape('toString')).toBeUndefined();
  });

  it(String.raw`gives \i and \c the characters of XML names`, () => {
    const nameStart = exactly(multiCharEscape('i') as string);
    const name = exactly(multiCharEscape('c') as string);
    for (let codePoint = 0; codePoint <= 0x1_00_ff; codePoint++) {
      if (codePoint >= 0xd8_00 && codePoint <= 0xdf_ff) continue;
      const char = String.fromCodePoint(codePoint);
      expect(nameStart.test(char)).toBe(isNameStartChar(codePoint));
      expect(name.test(char)).toBe(isNameChar(codePoint));
    }
    for (const codePoint of [0xe_ff_ff, 0xf_00_00]) {
      expect(name.test(String.fromCodePoint(codePoint))).toBe(isNameChar(codePoint));
    }
  });
});

describe('isCategory', () => {
  it('accepts the general categories XSD allows', () => {
    expect(['L', 'Lu', 'M', 'Nd', 'P', 'Pi', 'Z', 'Zl', 'S', 'So', 'C', 'Cn'].every((name) => isCategory(name))).toBe(
      true
    );
    expect(['Cs', 'LC', 'lu', 'Letter', 'IsBasicLatin', ''].some((name) => isCategory(name))).toBe(false);
  });
});

describe('isBlockName and blockRanges', () => {
  it('accepts names made of letters, digits and hyphens', () => {
    expect([isBlockName('Latin-1Supplement'), isBlockName('Basic Latin'), isBlockName('')]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('finds Unicode 17 blocks and the names XSD 1.0 used', () => {
    expect(blockRanges('BasicLatin')).toEqual([[0x0, 0x7f]]);
    expect(blockRanges('Greek')).toEqual([[0x3_70, 0x3_ff]]);
    expect(blockRanges('CombiningMarksforSymbols')).toEqual([[0x20_d0, 0x20_ff]]);
    expect(blockRanges('PrivateUse')).toEqual([
      [0xe0_00, 0xf8_ff],
      [0xf_00_00, 0xf_ff_ff],
      [0x10_00_00, 0x10_ff_ff],
    ]);
    expect([blockRanges('Klingon'), blockRanges('toString'), blockRanges('basiclatin')]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('patternChar and classChar', () => {
  it('escapes what JavaScript reads as syntax, and writes other characters as they are', () => {
    expect(patternChar(0x2e)).toBe(String.raw`\.`);
    expect(patternChar(0x2d)).toBe('-');
    expect(classChar(0x2d)).toBe(String.raw`\-`);
    expect(classChar(0x26)).toBe(String.raw`\&`);
    expect(patternChar(0x61)).toBe('a');
    expect(classChar(0xe9)).toBe('\u00E9');
    expect(patternChar(0x1_f6_00)).toBe('\u{1F600}');
  });

  it('writes control characters and lone surrogates as escapes', () => {
    expect([patternChar(0x0), classChar(0x1f), patternChar(0x7f), classChar(0xd8_00)]).toEqual([
      String.raw`\u{0}`,
      String.raw`\u{1f}`,
      String.raw`\u{7f}`,
      String.raw`\u{d800}`,
    ]);
  });

  it('writes every character so that it matches only itself', () => {
    for (let codePoint = 0; codePoint < 0x1_00; codePoint++) {
      const char = String.fromCodePoint(codePoint);
      expect(exactly(patternChar(codePoint)).test(char)).toBe(true);
      expect(exactly(`[${classChar(codePoint)}]`).test(char)).toBe(true);
      expect(exactly(`[${classChar(codePoint)}${classChar(codePoint)}]`).test(char)).toBe(true);
    }
  });

  it('writes a range as two class characters', () => {
    expect(classRange(0x2d, 0x2f)).toBe(String.raw`\--\/`);
  });
});
