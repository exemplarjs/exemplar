import { describe, expect, it, vi } from 'vitest';
import { parseDatePicture } from '@/functions/formatting/date-picture';
import { parsePrimaryToken } from '@/functions/formatting/integer-format';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';

// The parsers as they are, watched, to count how often a call has a picture or a token parsed.
vi.mock('@/functions/formatting/date-picture', async (original) => {
  const actual = await original<typeof import('@/functions/formatting/date-picture')>();
  return { ...actual, parseDatePicture: vi.fn(actual.parseDatePicture) };
});
vi.mock('@/functions/formatting/integer-format', async (original) => {
  const actual = await original<typeof import('@/functions/formatting/integer-format')>();
  return { ...actual, parsePrimaryToken: vi.fn(actual.parsePrimaryToken) };
});

/** 2003-09-07 formatted by a picture in a language and a calendar. */
function formatted(picture: string, language: string, calendar: string): string {
  return strings(`format-date(xs:date('2003-09-07'), '${picture}', ${language}, ${calendar}, ())`)[0] as string;
}

describe('fn:format-date, fn:format-time and fn:format-dateTime', () => {
  it('format each type with two and five arguments', () => {
    expect(
      strings(
        "format-date(xs:date('2003-09-07'), '[D]/[M]'), format-time(xs:time('09:15:00'), '[H01]:[m]', 'en', (), ()), " +
          "format-dateTime(xs:dateTime('2003-09-07T09:15:00'), '[Y] [H]', (), 'AD', 'Europe/Paris')"
      )
    ).toEqual(['7/9', '09:15', '2003 9']);
  });

  it('give the empty sequence for an empty value', () => {
    expect(evaluate("format-date((), '[Y]'), format-time((), '[H]', (), (), ())")).toEqual([]);
  });

  it('write names in other languages from Intl, and English for words, ordinals and unknown languages', () => {
    expect(formatted('[MNn]', "'de'", '()')).toBe('September');
    expect(formatted('[FNn]', "'de-AT'", '()')).toBe('Sonntag');
    expect(formatted('[D]. [MNn]', "'de'", '()')).toBe('7. September');
    expect(formatted('[MNn] [D]', "'en-GB'", '()')).toBe('September 7');
    expect(formatted('[MNn] [D1o]', "'de'", '()')).toBe('[Language: en]September 7th');
    expect(formatted('[Dw]', "'fr'", '()')).toBe('[Language: en]seven');
    expect(formatted('[MNn]', "'xib'", '()')).toBe('[Language: en]September');
    expect(formatted('[D]', "' '", '()')).toBe('7');
  });

  it('use the AD and ISO calendars, and AD in place of any other', () => {
    expect([
      formatted('[W] [C]', '()', "'ISO'"),
      formatted('[D] [C]', '()', "'Q{}AD'"),
      formatted('[D] [C]', '()', "' CB '"),
      formatted('[D]', '()', "'Q{http://example.com/cal}CB'"),
      formatted('[D]', '()', "'cal:CB'"),
      formatted('[D]', "'xib'", "'AH'"),
    ]).toEqual([
      '36 iso',
      '7 ad',
      '[Calendar: AD]7 ad',
      '[Calendar: AD]7',
      '[Calendar: AD]7',
      '[Calendar: AD][Language: en]7',
    ]);
  });

  it('reject calendar names that are not EQNames or not known designators', () => {
    expect(
      ["'ZODIAC'", "'Q{}ZODIAC'", "':w'", "'Q{}1'", "'1:CB'"].map((calendar) =>
        errorCode(`format-date(xs:date('2003-09-07'), '[D]', (), ${calendar}, ())`)
      )
    ).toEqual(['FOFD1340', 'FOFD1340', 'FOFD1340', 'FOFD1340', 'FOFD1340']);
  });
});

describe('format-date, found in review', () => {
  it("falls back to the component's default presentation for a format token it does not support", () => {
    expect(strings("format-time(xs:time('13:05:07'), '[mx]:[sQ]')")).toEqual(['05:07']);
    expect(strings("format-date(xs:date('2024-11-06'), '[Fx]')")).toEqual(['wednesday']);
  });

  it('reads a second modifier with a variant, as format-integer does', () => {
    expect(strings("format-date(xs:date('2024-11-06'), '[D1o(-e)] [D1ot]')")).toEqual(['6th 6th']);
  });

  it('raises FOFD1340 for a calendar name that is empty', () => {
    expect(errorCode("format-date(xs:date('2024-11-06'), '[D]', (), '', ())")).toBe('FOFD1340');
  });

  it('parses a picture and its number tokens once at each place it is called from', () => {
    vi.mocked(parseDatePicture).mockClear();
    vi.mocked(parsePrimaryToken).mockClear();
    const dates = "(xs:date('2003-09-07'), xs:date('2004-10-08'), xs:date('2005-11-09'))";
    expect(strings(`for $d in ${dates} return format-date($d, '[Y0001]-[M01]')`)).toEqual([
      '2003-09',
      '2004-10',
      '2005-11',
    ]);
    expect(vi.mocked(parseDatePicture).mock.calls.map(([picture]) => picture)).toEqual(['[Y0001]-[M01]']);
    expect(vi.mocked(parsePrimaryToken).mock.calls.map(([token]) => token)).toEqual(['0001', '01']);
  });
});
