import { describe, expect, it } from 'vitest';
import { XS } from '@/index';
import { acceptsText, applyWhitespace, isStringLike, whitespaceOf } from '@/text/string-values';

describe('string values', () => {
  it('applies the three kinds of whitespace handling', () => {
    expect(applyWhitespace(' a\tb\n', 'preserve')).toBe(' a\tb\n');
    expect(applyWhitespace(' a\tb\n', 'replace')).toBe(' a b ');
    expect(applyWhitespace(' a \t\r\n b ', 'collapse')).toBe('a b');
  });

  it('keeps characters that are whitespace to JavaScript but not to XML, such as a no-break space', () => {
    expect(applyWhitespace('\u00A0 a \u2003', 'collapse')).toBe('\u00A0 a \u2003');
  });

  it('gives each type its whitespace handling', () => {
    expect(
      [XS.string, XS.normalizedString, XS.token, XS.NCName, XS.untypedAtomic, XS.integer].map((type) =>
        whitespaceOf(type)
      )
    ).toEqual(['preserve', 'replace', 'collapse', 'collapse', 'preserve', 'collapse']);
  });

  it('checks text against a type and the types it derives from', () => {
    expect([acceptsText(XS.NCName, 'a1'), acceptsText(XS.NCName, 'a:b'), acceptsText(XS.Name, 'a:b')]).toEqual([
      true,
      false,
      true,
    ]);
    expect([acceptsText(XS.language, 'en-GB'), acceptsText(XS.language, 'englishlanguage')]).toEqual([true, false]);
    expect([acceptsText(XS.NMTOKEN, '1a'), acceptsText(XS.ID, '1a'), acceptsText(XS.string, '')]).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('knows which types hold text', () => {
    expect([XS.token, XS.anyURI, XS.untypedAtomic, XS.QName].map((type) => isStringLike(type))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});
