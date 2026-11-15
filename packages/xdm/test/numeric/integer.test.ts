import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { XS } from '@/index';
import { inIntegerRange, integerDivide, integerModulo, parseInteger } from '@/numeric/integer';

describe('integers', () => {
  it('reads the lexical forms of xs:integer', () => {
    expect(['42', '-007', '+1'].map((text) => parseInteger(text))).toEqual([42n, -7n, 1n]);
    expect(['1.0', '', '1e3', ' 1'].map((text) => parseInteger(text))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('checks the ranges of the integer types and the types they derive from', () => {
    expect([inIntegerRange(127n, XS.byte), inIntegerRange(128n, XS.byte), inIntegerRange(-129n, XS.byte)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([inIntegerRange(0n, XS.positiveInteger), inIntegerRange(-1n, XS.unsignedByte)]).toEqual([false, false]);
    expect(inIntegerRange(2n ** 70n, XS.integer)).toBe(true);
  });

  it('divides toward zero and takes remainders with the sign of the dividend', () => {
    expect([integerDivide(7n, 2n), integerDivide(-7n, 2n), integerModulo(-7n, 2n), integerModulo(7n, -2n)]).toEqual([
      3n,
      -3n,
      -1n,
      1n,
    ]);
    expect(codeOf(() => integerDivide(1n, 0n))).toBe('FOAR0001');
    expect(codeOf(() => integerModulo(1n, 0n))).toBe('FOAR0001');
  });
});
