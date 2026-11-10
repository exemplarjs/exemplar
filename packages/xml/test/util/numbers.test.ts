import { describe, expect, it } from 'vitest';
import { upperHex } from '@/util/numbers';

describe('upperHex', () => {
  it('writes upper-case hexadecimal padded to a width', () => {
    expect(upperHex(0xab, 4)).toBe('00AB');
    expect(upperHex(0x1_23_45, 4)).toBe('12345');
  });
});
