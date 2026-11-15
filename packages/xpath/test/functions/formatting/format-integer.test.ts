import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';

describe('fn:format-integer', () => {
  it('writes decimal digit patterns with padding and grouping', () => {
    expect(
      strings("format-integer(123, '00001'), format-integer(-123, '99999'), format-integer(1500000, '#,###,000')")
    ).toEqual(['00123', '-00123', '1,500,000']);
    expect(strings("format-integer(1234, '#;##1;'), format-integer(12345678901, '# 000')")).toEqual([
      '1;234',
      '12 345 678 901',
    ]);
  });

  it('writes ordinals with o and its variants, and ignores the other modifiers', () => {
    expect(
      strings(
        "format-integer(2, 'W;o'), format-integer(1, '1;o(-en)'), format-integer(1, 'Ww;t'), " +
          "format-integer(3, 'w;ca'), format-integer(1234, '()Ww;o')"
      )
    ).toEqual(['SECOND', '1st', 'One', 'three', '1234th']);
  });

  it('writes English whatever the language', () => {
    expect(
      strings("format-integer(11, 'Ww', 'en'), format-integer(2, 'Ww;o', 'fr'), format-integer(1, 'w', ())")
    ).toEqual(['Eleven', 'Second', 'one']);
  });

  it('gives the empty string for the empty sequence', () => {
    expect(evaluate("format-integer((), 'Ww')")).toEqual(['xs:string ']);
  });

  it('rejects an empty token, a bad modifier and a bad digit pattern', () => {
    expect(
      ["''", "';'", "'1;o(-er)z'", "'Ww;o('", "'0,000,'", "'11#0'"].map((picture) =>
        errorCode(`format-integer(1, ${picture})`)
      )
    ).toEqual(['FODF1310', 'FODF1310', 'FODF1310', 'FODF1310', 'FODF1310', 'FODF1310']);
  });
});
