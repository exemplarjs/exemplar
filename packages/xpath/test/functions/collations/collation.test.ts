import { describe, expect, it } from 'vitest';
import {
  CODEPOINT_COLLATION,
  codepointCollation,
  HTML_ASCII_CASE_INSENSITIVE_COLLATION,
  htmlAsciiCaseInsensitiveCollation,
} from '@/functions/collations/collation';

const utf8 = (bytes: Uint8Array | undefined): number[] => [...(bytes ?? [])];

describe('the codepoint collation', () => {
  it('compares by code points, so a supplementary character sorts after the BMP', () => {
    expect(codepointCollation.uri).toBe(CODEPOINT_COLLATION);
    expect(Math.sign(codepointCollation.compare('a', 'b'))).toBe(-1);
    expect(Math.sign(codepointCollation.compare('\u{10000}', '￿'))).toBe(1);
    expect(codepointCollation.compare('A', 'A')).toBe(0);
  });

  it('finds a search string exactly, anywhere, at the start or at the end', () => {
    expect(codepointCollation.find('banana', 'an', 'anywhere')).toEqual({ index: 1, length: 2 });
    expect(codepointCollation.find('banana', 'ba', 'start')).toEqual({ index: 0, length: 2 });
    expect(codepointCollation.find('banana', 'na', 'end')).toEqual({ index: 4, length: 2 });
    expect(codepointCollation.find('banana', 'an', 'start')).toBeUndefined();
    expect(codepointCollation.find('banana', 'ba', 'end')).toBeUndefined();
    expect(codepointCollation.find('banana', 'x', 'anywhere')).toBeUndefined();
  });

  it('gives the UTF-8 bytes as keys, which order as code points do', () => {
    expect(utf8(codepointCollation.key('é'))).toEqual([0xc3, 0xa9]);
  });
});

describe('the HTML ASCII case-insensitive collation', () => {
  it('compares with A to Z taken as a to z, and nothing else folded', () => {
    expect(htmlAsciiCaseInsensitiveCollation.uri).toBe(HTML_ASCII_CASE_INSENSITIVE_COLLATION);
    expect(htmlAsciiCaseInsensitiveCollation.compare('HeLLo', 'hello')).toBe(0);
    expect(htmlAsciiCaseInsensitiveCollation.compare('É', 'é')).not.toBe(0);
  });

  it('finds a search string whatever its ASCII case, at its place in the original text', () => {
    expect(htmlAsciiCaseInsensitiveCollation.find('xHELLOx', 'll', 'anywhere')).toEqual({ index: 3, length: 2 });
    expect(htmlAsciiCaseInsensitiveCollation.find('Hello', 'HE', 'start')).toEqual({ index: 0, length: 2 });
  });

  it('gives keys that are equal for strings equal but for ASCII case', () => {
    expect(utf8(htmlAsciiCaseInsensitiveCollation.key('AbC'))).toEqual(
      utf8(htmlAsciiCaseInsensitiveCollation.key('abc'))
    );
  });
});
