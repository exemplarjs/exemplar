import { describe, expect, it } from 'vitest';
import { ENGLISH, IntlNames, type NameLanguage, writeName } from '@/functions/formatting/date-names';

const NO_WIDTH = undefined;
const intlNames = new IntlNames();
const GERMAN: NameLanguage = { locale: 'de', intlNames };

describe('date names', () => {
  it('write English months, weekdays and day periods in three cases', () => {
    expect([
      writeName({ kind: 'month', index: 3 }, 'N', NO_WIDTH, ENGLISH),
      writeName({ kind: 'weekday', index: 7 }, 'n', NO_WIDTH, ENGLISH),
      writeName({ kind: 'dayPeriod', index: 2 }, 'Nn', NO_WIDTH, ENGLISH),
      writeName({ kind: 'text', text: 'AD' }, 'n', NO_WIDTH, ENGLISH),
    ]).toEqual(['MARCH', 'sunday', 'Pm', 'ad']);
  });

  it('shorten English names to their abbreviation, or to the maximum below three', () => {
    const wednesday = { kind: 'weekday', index: 3 } as const;
    expect([
      writeName(wednesday, 'Nn', { minimum: 3, maximum: 4 }, ENGLISH),
      writeName(wednesday, 'Nn', { minimum: undefined, maximum: 2 }, ENGLISH),
      writeName({ kind: 'month', index: 5 }, 'Nn', { minimum: 3, maximum: 3 }, ENGLISH),
      writeName({ kind: 'month', index: 5 }, 'Nn', { minimum: 5, maximum: undefined }, ENGLISH),
    ]).toEqual(['Wed', 'We', 'May', 'May  ']);
  });

  it('take month and weekday names in other languages from Intl, shortened to the maximum', () => {
    expect([
      writeName({ kind: 'month', index: 3 }, 'Nn', NO_WIDTH, GERMAN),
      writeName({ kind: 'month', index: 3 }, 'N', { minimum: undefined, maximum: 3 }, GERMAN),
      writeName({ kind: 'weekday', index: 1 }, 'n', { minimum: undefined, maximum: 2 }, GERMAN),
      writeName({ kind: 'dayPeriod', index: 1 }, 'n', NO_WIDTH, GERMAN),
    ]).toEqual(['März', 'MÄR', 'mo', 'am']);
  });
});

describe('IntlNames', () => {
  it('gives the names of months from 1 and of weekdays from Monday, in a locale', () => {
    expect([
      intlNames.name('month', 1, 'fr'),
      intlNames.name('weekday', 1, 'fr'),
      intlNames.name('month', 1, 'fr'),
    ]).toEqual(['janvier', 'lundi', 'janvier']);
  });
});
