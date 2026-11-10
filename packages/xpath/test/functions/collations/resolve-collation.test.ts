import { describe, expect, it } from 'vitest';
import {
  CODEPOINT_COLLATION,
  codepointCollation,
  HTML_ASCII_CASE_INSENSITIVE_COLLATION,
  htmlAsciiCaseInsensitiveCollation,
} from '@/functions/collations/collation';
import { resolveCollation } from '@/functions/collations/resolve-collation';
import { UCA_COLLATION } from '@/functions/collations/uca-collation';
import { XPathException } from '@/index';

describe('resolveCollation', () => {
  it('names the codepoint and HTML collations by their URIs', () => {
    expect(resolveCollation(CODEPOINT_COLLATION, undefined)).toBe(codepointCollation);
    expect(resolveCollation(HTML_ASCII_CASE_INSENSITIVE_COLLATION, undefined)).toBe(htmlAsciiCaseInsensitiveCollation);
  });

  it('resolves a relative URI against the static base URI', () => {
    expect(resolveCollation('codepoint', 'http://www.w3.org/2005/xpath-functions/collation/')).toBe(codepointCollation);
  });

  it('makes each UCA collation once, with or without parameters', () => {
    const plain = resolveCollation(UCA_COLLATION, undefined);
    expect(resolveCollation(UCA_COLLATION, undefined)).toBe(plain);
    const primary = resolveCollation(`${UCA_COLLATION}?strength=primary`, undefined);
    expect(primary).not.toBe(plain);
    expect(primary.compare('A', 'a')).toBe(0);
  });

  it('refuses any other collation with FOCH0002', () => {
    expect(() => resolveCollation('http://example.com/collation', undefined)).toThrow(XPathException);
    expect(() => resolveCollation(`${UCA_COLLATION}x`, undefined)).toThrow(/FOCH0002/);
  });
});
