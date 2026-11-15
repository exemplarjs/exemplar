import { describe, expect, it } from 'vitest';
import { errorCode, strings } from '../../helpers/evaluate.ts';

/** A dateTime of 2003-09-07T09:05:06.456 in a timezone 5 hours west of UTC, formatted by pictures. */
function formats(...pictures: readonly string[]): string[] {
  const value = "xs:dateTime('2003-09-07T09:05:06.456-05:00')";
  return strings(pictures.map((picture) => `format-dateTime(${value}, '${picture}')`).join(', '));
}

describe('date and time components', () => {
  it('write numbers by their default and given presentation', () => {
    expect(
      formats('[Y]-[M]-[D] [H]:[m]:[s]', '[Y0001]-[M01]-[D01]', '[d] [W] [w] [F1] [h]', '[DI] [Mi] [Dw] [Da]')
    ).toEqual(['2003-9-7 9:05:06', '2003-09-07', '250 36 1 7 9', 'VII ix seven g']);
  });

  it('write ordinals and fall back to the default presentation for names a number lacks', () => {
    expect(formats('[D1o] [Dwo] [DNn] [Hn]')).toEqual(['7th seventh 7 9']);
  });

  it('pad numbers to the minimum width, a non-decimal one with spaces', () => {
    expect(formats('[M,3]', '[m,1-2]', '[DI,4]', '[Y,2-2]')).toEqual(['009', '5', 'VII ', '03']);
  });

  it('cut a year to its maximum width, or to the digits of a pattern with several', () => {
    expect(formats('[Y01]', '[Y#.0]', '[Y1]', '[Yi,2-2]', '[Y,*-3]')).toEqual(['03', '3', '2003', 'iii', '3']);
  });

  it('write names of months, weekdays, day periods, eras and calendars', () => {
    expect(formats('[MNn] [FNn] [F] [P] [PN] [EN] [C]', '[MN,3-3] [FNn,3-4]')).toEqual([
      'September Sunday sunday am AM AD ad',
      'SEP Sun',
    ]);
  });

  it('write fractions of a second from the left, cut and not rounded', () => {
    expect(formats('[f]', '[f01]', '[f001]', '[f99#]', '[f,4-4]', '[f,*-2]', '[f0~0~0]', '[fi]', '[fNn,2]')).toEqual([
      '456',
      '45',
      '456',
      '456',
      '4560',
      '45',
      '4~5~6',
      'cdlvi',
      '456',
    ]);
    expect(
      strings(
        "format-time(xs:time('12:00:00'), '[f]'), format-time(xs:time('12:00:00.006'), '[f,*-2]'), " +
          "format-time(xs:time('12:00:00'), '[fi]')"
      )
    ).toEqual(['0', '0', '0']);
  });

  it('write timezones with Z and z', () => {
    expect(formats('[Z] [z] [Z0] [ZZ]')).toEqual(['-05:00 GMT-05:00 -5 R']);
  });

  it('write the hour on a twelve-hour clock and the day period', () => {
    expect(strings("format-time(xs:time('00:30:00'), '[h][P]'), format-time(xs:time('12:30:00'), '[h][P]')")).toEqual([
      '12am',
      '12pm',
    ]);
  });

  it('write an era before the common era', () => {
    expect(strings("format-date(xs:date('-0055-03-15'), '[Y] [EN]')")).toEqual(['55 BC']);
  });

  it('raise FOFD1350 for components a value lacks, and FOFD1340 for bad presentations', () => {
    expect(
      ['[H]', '[P]', '[f]'].map((picture) => errorCode(`format-date(xs:date('2000-01-01'), '${picture}')`))
    ).toEqual(['FOFD1350', 'FOFD1350', 'FOFD1350']);
    expect(['[Y]', '[E]', '[F]'].map((picture) => errorCode(`format-time(xs:time('12:00:00'), '${picture}')`))).toEqual(
      ['FOFD1350', 'FOFD1350', 'FOFD1350']
    );
    expect([
      errorCode("format-date(xs:date('2000-01-01'), '[Y999#]')"),
      errorCode("format-time(xs:time('12:00:00'), '[f#9]')"),
    ]).toEqual(['FOFD1340', 'FOFD1340']);
  });
});

describe('date and time components, found in review', () => {
  it('quote a fraction pattern as the picture has it when it is invalid', () => {
    expect(() => strings("format-time(xs:time('10:00:00.5'), '[f#0]')")).toThrow("'#0' has optional digits");
  });
});
