import { describe, expect, it } from 'vitest';
import { UCA_COLLATION, ucaCollation } from '@/functions/collations/uca-collation';
import { XPathException } from '@/index';

/** A UCA collation with parameters. */
const uca = (parameters = ''): ReturnType<typeof ucaCollation> =>
  ucaCollation(parameters === '' ? UCA_COLLATION : `${UCA_COLLATION}?${parameters}`);

/** The error code making a UCA collation with parameters raises. */
function refusal(parameters: string): string | undefined {
  try {
    uca(parameters);
    return undefined;
  } catch (error) {
    return error instanceof XPathException ? error.code : 'not an XPathException';
  }
}

const sign = (value: number): number => Math.sign(value);

describe('UCA collations', () => {
  it('default to the tertiary strength, lower case first, in English', () => {
    const collation = uca();
    expect(collation.uri).toBe(UCA_COLLATION);
    expect(sign(collation.compare('a', 'A'))).toBe(-1);
    expect(sign(collation.compare('a', 'á'))).toBe(-1);
    expect(sign(collation.compare('a', 'b'))).toBe(-1);
  });

  it('ignore accents and case at the primary strength, case only at the secondary', () => {
    expect(uca('strength=primary').compare('Résumé', 'resume')).toBe(0);
    expect(uca('strength=1').compare('A', 'a')).toBe(0);
    expect(uca('strength=secondary').compare('A', 'a')).toBe(0);
    expect(uca('strength=2').compare('á', 'a')).not.toBe(0);
  });

  it('keep case at the primary strength with caseLevel', () => {
    expect(uca('strength=primary;caseLevel=yes').compare('A', 'a')).not.toBe(0);
    expect(uca('strength=primary;caseLevel=yes').compare('á', 'a')).toBe(0);
  });

  it('put upper case first when asked, whatever the language does by default', () => {
    expect(sign(uca('caseFirst=upper').compare('A', 'a'))).toBe(-1);
    expect(sign(uca('lang=da').compare('a', 'A'))).toBe(-1);
  });

  it('order digits by value with numeric=yes', () => {
    expect(sign(uca('numeric=yes').compare('item 9', 'item 10'))).toBe(-1);
    expect(sign(uca().compare('item 9', 'item 10'))).toBe(1);
  });

  it('set punctuation and spaces aside with alternate=shifted or blanked', () => {
    expect(uca('alternate=shifted').compare('data base', 'database')).toBe(0);
    expect(uca('alternate=blanked;strength=primary').compare('data-base', 'database')).toBe(0);
  });

  it('break ties by punctuation at the quaternary strength, and by code points at the identical', () => {
    expect(uca('alternate=shifted;strength=quaternary').compare('data base', 'database')).not.toBe(0);
    expect(uca('alternate=shifted;strength=4').compare('a', 'a')).toBe(0);
    expect(uca('strength=identical').compare('á', 'á')).toBe(0);
    expect(uca('strength=5;alternate=shifted').compare('data base', 'database')).not.toBe(0);
  });

  it('fall back to English for a language the runtime lacks, unless fallback=no', () => {
    expect(uca('lang=xx-unknown-tag-zz').compare('a', 'b')).toBeLessThan(0);
    expect(uca('lang=not a tag!').compare('a', 'b')).toBeLessThan(0);
    expect(refusal('lang=not a tag!;fallback=no')).toBe('FOCH0002');
    expect(refusal('lang=sv;fallback=no')).toBeUndefined();
  });

  it('approximate what Intl cannot honour, and refuse it with fallback=no', () => {
    expect(refusal('backwards=yes')).toBeUndefined();
    expect(refusal('strength=bogus;version=9.9;reorder=Grek;colour=red')).toBeUndefined();
    for (const parameters of [
      'backwards=yes',
      'maxVariable=space',
      'strength=bogus',
      'version=7.0',
      'reorder=Grek',
      'colour=red',
    ]) {
      expect(refusal(`${parameters};fallback=no`)).toBe('FOCH0002');
    }
    expect(refusal('strength=primary;caseFirst=upper;numeric=no;normalization=yes;fallback=no')).toBeUndefined();
  });

  it('find the shortest equal stretch of the text, by the collation', () => {
    const collation = uca('strength=primary');
    expect(collation.find('Résumé here', 'resume', 'anywhere')).toEqual({ index: 0, length: 6 });
    expect(collation.find('a RÉSUMÉ', 'resume', 'end')).toEqual({ index: 2, length: 6 });
    expect(collation.find('résumé', 'RES', 'start')).toEqual({ index: 0, length: 3 });
    expect(collation.find('résumé', 'sum', 'start')).toBeUndefined();
    expect(collation.find('abc', '', 'anywhere')).toEqual({ index: 0, length: 0 });
    expect(collation.find('x\u{1F600}y', '\u{1F600}', 'anywhere')).toEqual({ index: 1, length: 2 });
  });

  it('give no collation keys', () => {
    expect(uca().key('a')).toBeUndefined();
  });

  // The browser tests run this in Chromium, Firefox and WebKit, so it checks that the runtimes agree.
  it('orders words alike in every runtime, the options all given explicitly', () => {
    const words = [
      'resume',
      'résumé',
      'Resume',
      'RÉSUMÉ',
      'cote',
      'côte',
      'coté',
      'côté',
      'a',
      'A',
      'å',
      'Å',
      'ä',
      'æ',
      'Æ',
      'ø',
      'ö',
    ];
    const sorted = (parameters: string): string[] => {
      const collation = uca(parameters);
      return words.toSorted((first, second) => collation.compare(first, second) || (first < second ? -1 : 1));
    };
    expect(sorted('lang=en')).toEqual([
      'a',
      'A',
      'å',
      'Å',
      'ä',
      'æ',
      'Æ',
      'cote',
      'coté',
      'côte',
      'côté',
      'ö',
      'ø',
      'resume',
      'Resume',
      'résumé',
      'RÉSUMÉ',
    ]);
    expect(sorted('lang=sv')).toEqual([
      'a',
      'A',
      'cote',
      'coté',
      'côte',
      'côté',
      'resume',
      'Resume',
      'résumé',
      'RÉSUMÉ',
      'å',
      'Å',
      'ä',
      'æ',
      'Æ',
      'ö',
      'ø',
    ]);
    expect(sorted('lang=da')).toEqual([
      'a',
      'A',
      'cote',
      'coté',
      'côte',
      'côté',
      'resume',
      'Resume',
      'résumé',
      'RÉSUMÉ',
      'æ',
      'Æ',
      'ä',
      'ø',
      'ö',
      'å',
      'Å',
    ]);
    expect(sorted('lang=da;caseFirst=upper')).toEqual([
      'A',
      'a',
      'cote',
      'coté',
      'côte',
      'côté',
      'Resume',
      'resume',
      'RÉSUMÉ',
      'résumé',
      'Æ',
      'æ',
      'ä',
      'ø',
      'ö',
      'Å',
      'å',
    ]);
  });
});

describe('UCA collations, found in review', () => {
  it('keeps the last value of a keyword given twice, as F&O §5.3.3 says', () => {
    expect(uca('strength=primary;strength=tertiary').compare('a', 'A')).not.toBe(0);
  });

  it('keeps case at the secondary strength with caseLevel, which it cannot do exactly without fallback', () => {
    expect(uca('strength=secondary;caseLevel=yes').compare('a', 'A')).not.toBe(0);
    expect(refusal('strength=secondary;caseLevel=yes;fallback=no')).toBe('FOCH0002');
    expect(refusal('caseLevel=yes;fallback=no')).toBeUndefined();
  });

  it('accepts the quaternary and identical strengths it gives, and refuses a value holding =, without fallback', () => {
    expect(refusal('strength=quaternary;fallback=no')).toBeUndefined();
    expect(refusal('strength=identical;fallback=no')).toBeUndefined();
    expect(refusal('strength=primary=x;fallback=no')).toBe('FOCH0002');
  });

  it('leaves out of a match the ignorable characters before it (F&O §5.3.1 examples)', () => {
    const blanked = uca('lang=en;alternate=blanked;strength=primary');
    const before = (text: string, search: string): string =>
      text.slice(0, blanked.find(text, search, 'anywhere')?.index);
    expect(before('abc--d-e-fghi', '--d-e-')).toBe('abc--');
    expect(before('a*b*c*d*e*f*g*h*i*', '***cde')).toBe('a*b*');
  });
});
