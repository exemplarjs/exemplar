import { describe, expect, it } from 'vitest';
import { DEFAULT_DECIMAL_FORMAT, parseNumberPicture } from '@/functions/formatting/number-picture';

/** A picture's positive sub-picture. */
function positive(picture: string) {
  return parseNumberPicture(picture, DEFAULT_DECIMAL_FORMAT).positive;
}

/** The code a picture raises, or undefined. */
function failure(picture: string): string | undefined {
  try {
    parseNumberPicture(picture, DEFAULT_DECIMAL_FORMAT);
    return undefined;
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe('format-number pictures', () => {
  it('read the prefix, suffix, digit counts and grouping of a sub-picture', () => {
    expect(positive('PREFIX#,##0.00#SUFFIX')).toEqual({
      prefix: 'PREFIX',
      suffix: 'SUFFIX',
      integer: { zero: 0x30, mandatoryDigits: 1, digitSigns: 4, separators: new Map([[3, ',']]), regularInterval: 3 },
      fractionGrouping: [],
      minimumExponentDigits: undefined,
      factor: 1,
      minimumIntegerDigits: 1,
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    });
  });

  it('tell regular from irregular grouping, and count fraction separators from the point', () => {
    expect(positive('#,##,00').integer.regularInterval).toBe(2);
    expect(positive('###,##,00').integer.regularInterval).toBeUndefined();
    expect(positive('#,###,##').integer.regularInterval).toBeUndefined();
    expect(positive('#.##,##,##').fractionGrouping).toEqual([2, 4]);
  });

  it('take a percent or per-mille factor and an exponent', () => {
    expect([positive('#%').factor, positive('#\u2030').factor]).toEqual([100, 1000]);
    expect(positive('00.0e000')).toMatchObject({ minimumExponentDigits: 3, integer: { mandatoryDigits: 2 } });
    expect(positive('9.9999eDog')).toMatchObject({ minimumExponentDigits: undefined, suffix: 'eDog' });
  });

  it('adjust pictures with no mandatory digits', () => {
    expect(positive('#')).toMatchObject({ minimumIntegerDigits: 1, minimumFractionDigits: 0 });
    expect(positive('#.#')).toMatchObject({ minimumIntegerDigits: 0, minimumFractionDigits: 1 });
    expect(positive('#e0')).toMatchObject({
      minimumIntegerDigits: 1,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    expect(positive('.#e0')).toMatchObject({ minimumIntegerDigits: 0, minimumFractionDigits: 1 });
  });

  it('read a negative sub-picture after the pattern separator', () => {
    expect(parseNumberPicture('#;(#)', DEFAULT_DECIMAL_FORMAT).negative).toMatchObject({ prefix: '(', suffix: ')' });
  });

  it('reject what F&O forbids', () => {
    const pictures = [
      '#;#;#',
      'fred.ginger',
      '#a#',
      '#.#.#',
      '#%%',
      '#%\u2030',
      '9.99e99e99',
      '9e9%',
      '9.9999e,',
      '#,.##',
      '#.,##',
      '#,',
      '#,,###',
      '0#',
      '0.#0',
      '#;',
    ];
    expect(pictures.map((picture) => failure(picture))).toEqual(pictures.map(() => 'FODF1310'));
    expect(failure('#.##,')).toBeUndefined();
  });
});
