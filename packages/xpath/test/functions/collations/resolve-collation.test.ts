import { describe, expect, it } from 'vitest';
import {
  CODEPOINT_COLLATION,
  codepointCollation,
  HTML_ASCII_CASE_INSENSITIVE_COLLATION,
  htmlAsciiCaseInsensitiveCollation,
} from '@/functions/collations/collation';
import { Collations } from '@/functions/collations/resolve-collation';
import { UCA_COLLATION } from '@/functions/collations/uca-collation';
import { XPathException } from '@/index';

/** One compiler's collations. */
const collations = new Collations();

describe('Collations', () => {
  it('names the codepoint and HTML collations by their URIs', () => {
    expect(collations.resolve(CODEPOINT_COLLATION, undefined)).toBe(codepointCollation);
    expect(collations.resolve(HTML_ASCII_CASE_INSENSITIVE_COLLATION, undefined)).toBe(
      htmlAsciiCaseInsensitiveCollation
    );
  });

  it('resolves a relative URI against the static base URI', () => {
    expect(collations.resolve('codepoint', 'http://www.w3.org/2005/xpath-functions/collation/')).toBe(
      codepointCollation
    );
  });

  it('makes each UCA collation once for a compiler, with or without parameters', () => {
    const plain = collations.resolve(UCA_COLLATION, undefined);
    expect(collations.resolve(UCA_COLLATION, undefined)).toBe(plain);
    expect(new Collations().resolve(UCA_COLLATION, undefined)).not.toBe(plain);
    const primary = collations.resolve(`${UCA_COLLATION}?strength=primary`, undefined);
    expect(primary).not.toBe(plain);
    expect(primary.compare('A', 'a')).toBe(0);
  });

  it('refuses any other collation with FOCH0002', () => {
    expect(() => collations.resolve('http://example.com/collation', undefined)).toThrow(XPathException);
    expect(() => collations.resolve(`${UCA_COLLATION}x`, undefined)).toThrow(/FOCH0002/);
  });
});
