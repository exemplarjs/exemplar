import { describe, expect, it } from 'vitest';
import { errorCode, strings } from '../../helpers/evaluate.ts';

/** The strings each pair of value and picture formats to. */
function formats(...pairs: readonly (readonly [string, string])[]): string[] {
  return strings(pairs.map(([value, picture]) => `format-number(${value}, '${picture}')`).join(', '));
}

describe('fn:format-number', () => {
  it('rounds half to even to the fraction digits allowed and pads to those required', () => {
    expect(
      formats(['2392.14*36.58', '000,000.000000'], ['0.125', '0.00'], ['0.135', '0.00'], ['239236.588', '00000.00'])
    ).toEqual(['087,504.481200', '0.12', '0.14', '239236.59']);
  });

  it('writes zero and small numbers as the minimum sizes say', () => {
    expect(formats(['0', '#.#'], ['0', '#'], ['0.2', '.#'], ['0.2', '#.'], ['1.2', 'this.#'])).toEqual([
      '.0',
      '0',
      '.2',
      '0',
      'this1.2',
    ]);
  });

  it('groups the integer part, repeating regular grouping, and the fraction', () => {
    expect(formats(['1E25', '#,######'], ['642120', '####,##'], ['12345.6789012345', '#.#,##,#'])).toEqual([
      '10,000000,000000,000000,000000',
      '6421,20',
      '12345.6,78,9',
    ]);
  });

  it('scales by percent and per-mille in the value type', () => {
    expect(
      formats(['0.4857', '###.###%'], ['0.4857', '###.###\u2030'], ['xs:float(0.25)', '0%'], ['1e308', '0%'])
    ).toEqual(['48.57%', '485.7\u2030', '25%', 'Infinity%']);
  });

  it('writes an exponent, its mantissa sized by the mandatory integer digits', () => {
    expect(
      formats(
        ['12345.678', '9.9999e999'],
        ['0.2', '000.0e0'],
        ['1.2', '#.#e0'],
        ['0.99999999', '0.0e0'],
        ['0', '#.#e9'],
        ['0.05', '9.9999e99']
      )
    ).toEqual(['1.2346e004', '200.0e-3', '0.1e1', '10.0e-1', '0e0', '5.0000e-02']);
  });

  it('uses the negative sub-picture or a minus sign, also for negative zero and infinity', () => {
    expect(
      formats(
        ['-26931.4', '+#,###.###;-#,###.###'],
        ['-26931.4', '#,###'],
        ['0 div xs:double("-INF")', '#'],
        ['-1 div 0e0', 'PREFIX#SUFFIX'],
        ['-1 div 0e0', 'A#;B#C'],
        ["xs:float('-0')", '#']
      )
    ).toEqual(['-26,931.4', '-26,931', '-0', '-PREFIXInfinitySUFFIX', 'BInfinityC', '-0']);
  });

  it('writes NaN alone, also for the empty sequence', () => {
    expect(formats(['number("abc")', 'PREFIX#SUFFIX'], ['()', '#'])).toEqual(['NaN', 'NaN']);
  });

  it('writes floats by their own shortest digits, and integers exactly', () => {
    expect(
      formats(['xs:float(0.1)', '0.000000000'], ['xs:float(1e20)', '#'], ['123456789012345678901234567890', '#,###'])
    ).toEqual(['0.100000000', '100000000000000000000', '123,456,789,012,345,678,901,234,567,890']);
  });

  it('knows only the default decimal format', () => {
    expect(strings("format-number(1, '#', ())")).toEqual(['1']);
    const calls = ["format-number(1, '#', 'foo:bar')", "format-number(1, '0.#0', 'x')", "format-number(1, '#', ' ')"];
    expect(calls.map((call) => errorCode(call))).toEqual(['FODF1280', 'FODF1280', 'FODF1280']);
  });
});

describe('format-number, found in review', () => {
  it('raises FODF1280 for a decimal format name that is empty', () => {
    expect(errorCode("format-number(5, '0.0', '')")).toBe('FODF1280');
  });
});
