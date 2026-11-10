import { decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { castNumericContent } from '@/casting/numeric-casts';
import { XdmAtomicValue, XS } from '@/index';

describe('castNumericContent', () => {
  it('gives the content of each numeric and boolean target', () => {
    const value = decimal('2.5');
    expect([
      castNumericContent(value, XS.integer),
      castNumericContent(value, XS.double),
      castNumericContent(value, XS.boolean),
    ]).toEqual([2n, 2.5, true]);
    expect(castNumericContent(XdmAtomicValue.double(1 / 3), XS.float)).toBe(Math.fround(1 / 3));
    expect(castNumericContent(XdmAtomicValue.integer(0n), XS.boolean)).toBe(false);
  });
});
