import { describe, expect, it } from 'vitest';
import { caseVariants, caseVariantsInRange } from '@/util/case-variants';

/** A character's case variants as a sorted string. */
const variantsOf = (char: string): string =>
  String.fromCodePoint(...caseVariants(char.codePointAt(0) as number).toSorted((a, b) => a - b));

describe('caseVariants (F&O 3.1 §5.6.2)', () => {
  it.each([
    ['a', 'A'],
    ['A', 'a'],
    ['k', 'K\u212A'],
    ['\u212A', 'Kk'],
    ['s', 'S\u017F'],
    ['i', 'I\u0131'],
    ['\u0131', 'Ii'],
    ['\u0130', ''],
    ['\u00DF', '\u1E9E'],
    ['\u03C3', '\u03A3\u03C2'],
    ['\u01C5', '\u01C4\u01C6'],
    ['\u0390', '\u1FD3'],
    ['\u{10400}', '\u{10428}'],
    ['1', ''],
    ['\u4E2D', ''],
  ])('finds the variants of %j: %j', (char, expected) => {
    expect(variantsOf(char)).toBe(expected);
  });

  it('agrees with the definition: same lower case or same upper case', () => {
    for (const char of ['A', 'k', '\u212A', '\u0131', '\u00DF', '\u03C2', '\u1E9B', '\u0345']) {
      const codePoint = char.codePointAt(0) as number;
      for (const variant of caseVariants(codePoint)) {
        const other = String.fromCodePoint(variant);
        const related = other.toLowerCase() === char.toLowerCase() || other.toUpperCase() === char.toUpperCase();
        expect(related).toBe(true);
      }
    }
  });

  it('relies on every character a case mapping yields being changed by case mapping itself', () => {
    const changes = (char: string): boolean => char.toLowerCase() !== char || char.toUpperCase() !== char;
    const unchanged: string[] = [];
    for (let codePoint = 0; codePoint <= 0x1_ff_ff; codePoint++) {
      const char = String.fromCodePoint(codePoint);
      for (const mapping of [char.toLowerCase(), char.toUpperCase()]) {
        if (mapping !== char && Array.from(mapping).length === 1 && !changes(mapping)) unchanged.push(mapping);
      }
    }
    expect(unchanged).toEqual([]);
  });

  it('finds no case mapping beyond plane 1, where the table stops', () => {
    let beyond = 0;
    for (let codePoint = 0x2_00_00; codePoint <= 0x10_ff_ff; codePoint += 1) {
      if (/\p{Changes_When_Casemapped}/v.test(String.fromCodePoint(codePoint))) beyond++;
    }
    expect(beyond).toBe(0);
  });
});

describe('caseVariantsInRange', () => {
  it('collects the variants of every character in the range', () => {
    const variants = new Set(caseVariantsInRange(0x41, 0x5a));
    expect(['a', 'z', '\u212A', '\u017F', '\u0131'].every((char) => variants.has(char.codePointAt(0) as number))).toBe(
      true
    );
    expect(caseVariantsInRange(0x30, 0x39)).toEqual([]);
  });
});
