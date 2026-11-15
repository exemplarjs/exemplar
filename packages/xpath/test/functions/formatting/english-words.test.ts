import { describe, expect, it } from 'vitest';
import { cardinalWords, ordinalSuffix, ordinalWords } from '@/functions/formatting/english-words';

describe('English number words', () => {
  it('name numbers below a thousand', () => {
    expect([0n, 7n, 19n, 20n, 42n, 100n, 115n].map((value) => cardinalWords(value))).toEqual([
      'zero',
      'seven',
      'nineteen',
      'twenty',
      'forty-two',
      'one hundred',
      'one hundred and fifteen',
    ]);
  });

  it('name larger numbers by powers of a thousand, joining a small last group with and', () => {
    expect(cardinalWords(1001n)).toBe('one thousand and one');
    expect(cardinalWords(2_000_000n)).toBe('two million');
    expect(cardinalWords(1_234_567n)).toBe(
      'one million two hundred and thirty-four thousand five hundred and sixty-seven'
    );
  });

  it('give up beyond a thousand decillions', () => {
    expect(cardinalWords(10n ** 36n - 1n)?.startsWith('nine hundred and ninety-nine decillion')).toBe(true);
    expect(cardinalWords(10n ** 36n)).toBeUndefined();
    expect(ordinalWords(10n ** 36n)).toBeUndefined();
  });

  it('make ordinals of the last word', () => {
    expect([1n, 2n, 3n, 5n, 8n, 9n, 12n, 20n, 21n, 100n, 0n].map((value) => ordinalWords(value))).toEqual([
      'first',
      'second',
      'third',
      'fifth',
      'eighth',
      'ninth',
      'twelfth',
      'twentieth',
      'twenty-first',
      'one hundredth',
      'zeroth',
    ]);
  });

  it('give ordinal suffixes, with th for eleven to thirteen', () => {
    expect([1n, 2n, 3n, 4n, 11n, 12n, 13n, 21n, 102n, 111n].map((value) => ordinalSuffix(value))).toEqual([
      'st',
      'nd',
      'rd',
      'th',
      'th',
      'th',
      'th',
      'st',
      'nd',
      'th',
    ]);
  });
});
