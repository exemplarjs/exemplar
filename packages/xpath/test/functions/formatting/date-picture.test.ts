import { describe, expect, it } from 'vitest';
import { parseDatePicture } from '@/functions/formatting/date-picture';

/** The code a picture raises, or undefined. */
function failure(picture: string): string | undefined {
  try {
    parseDatePicture(picture);
    return undefined;
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe('format-date pictures', () => {
  it('split literal text from markers, reading doubled brackets as literals', () => {
    expect(parseDatePicture('[[[D]]] of [MNn]')).toEqual([
      '[',
      { component: 'D', presentation: undefined, ordinal: false, traditional: false, width: undefined },
      '] of ',
      { component: 'M', presentation: 'Nn', ordinal: false, traditional: false, width: undefined },
    ]);
  });

  it('read second modifiers and widths after the last comma, ignoring whitespace', () => {
    expect(parseDatePicture('[D1o][Y9,999,*][ f 0 0 ,2-4][Z0t][D1o(-e)t]')).toEqual([
      { component: 'D', presentation: '1', ordinal: true, traditional: false, width: undefined },
      {
        component: 'Y',
        presentation: '9,999',
        ordinal: false,
        traditional: false,
        width: { minimum: undefined, maximum: undefined },
      },
      { component: 'f', presentation: '00', ordinal: false, traditional: false, width: { minimum: 2, maximum: 4 } },
      { component: 'Z', presentation: '0', ordinal: false, traditional: true, width: undefined },
      { component: 'D', presentation: '1', ordinal: true, traditional: true, width: undefined },
    ]);
  });

  it('keep literal text after the last marker', () => {
    expect(parseDatePicture('Day [D].').at(-1)).toBe('.');
  });

  it('reject unknown components, bad widths and unbalanced brackets', () => {
    const pictures = ['[bla]', '[]', '[Y', 'Y]', '[f1,0-3]', '[f1,*-0]', '[f1,3-2]', '[M,x]'];
    expect(pictures.map((picture) => failure(picture))).toEqual(pictures.map(() => 'FOFD1340'));
  });
});
