import { describe, expect, it } from 'vitest';
import { writeName } from '@/functions/formatting/date-names';

const NO_WIDTH = undefined;

describe('date names', () => {
  it('write English months, weekdays and day periods in three cases', () => {
    expect([
      writeName({ kind: 'month', index: 3 }, 'N', undefined, NO_WIDTH),
      writeName({ kind: 'weekday', index: 7 }, 'n', undefined, NO_WIDTH),
      writeName({ kind: 'dayPeriod', index: 2 }, 'Nn', undefined, NO_WIDTH),
      writeName({ kind: 'text', text: 'AD' }, 'n', undefined, NO_WIDTH),
    ]).toEqual(['MARCH', 'sunday', 'Pm', 'ad']);
  });

  it('shorten English names to their abbreviation, or to the maximum below three', () => {
    const wednesday = { kind: 'weekday', index: 3 } as const;
    expect([
      writeName(wednesday, 'Nn', undefined, { minimum: 3, maximum: 4 }),
      writeName(wednesday, 'Nn', undefined, { minimum: undefined, maximum: 2 }),
      writeName({ kind: 'month', index: 5 }, 'Nn', undefined, { minimum: 3, maximum: 3 }),
      writeName({ kind: 'month', index: 5 }, 'Nn', undefined, { minimum: 5, maximum: undefined }),
    ]).toEqual(['Wed', 'We', 'May', 'May  ']);
  });

  it('take month and weekday names in other languages from Intl, shortened to the maximum', () => {
    expect([
      writeName({ kind: 'month', index: 3 }, 'Nn', 'de', NO_WIDTH),
      writeName({ kind: 'month', index: 3 }, 'N', 'de', { minimum: undefined, maximum: 3 }),
      writeName({ kind: 'weekday', index: 1 }, 'n', 'de', { minimum: undefined, maximum: 2 }),
      writeName({ kind: 'dayPeriod', index: 1 }, 'n', 'de', NO_WIDTH),
    ]).toEqual(['M\u00E4rz', 'M\u00C4R', 'mo', 'am']);
  });
});
