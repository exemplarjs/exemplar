import { describe, expect, it } from 'vitest';
import { compareBytes, formatBase64, formatHex, parseBase64, parseHex } from '@/text/binary';

describe('binary values', () => {
  it('reads and writes hexadecimal', () => {
    expect(parseHex('0aFf')).toEqual(new Uint8Array([10, 255]));
    expect(parseHex('')).toEqual(new Uint8Array([]));
    expect([parseHex('abc'), parseHex('zz')]).toEqual([undefined, undefined]);
    expect(formatHex(new Uint8Array([1, 171]))).toBe('01AB');
  });

  it('reads base64 with its padding and spaces', () => {
    expect(parseBase64('AQID')).toEqual(new Uint8Array([1, 2, 3]));
    expect(parseBase64('AQ==')).toEqual(new Uint8Array([1]));
    expect(parseBase64('AQI=')).toEqual(new Uint8Array([1, 2]));
    expect(parseBase64('AQ ID')).toEqual(new Uint8Array([1, 2, 3]));
    expect(parseBase64('')).toEqual(new Uint8Array([]));
  });

  it('refuses base64 that XML Schema does not allow', () => {
    // Wrong length, unused bits that are not zero, and padding in the wrong place.
    expect(['AQI', 'AR==', 'AQJ=', 'A===', '=AQI', 'AQ=I'].map((text) => parseBase64(text))).toEqual(
      Array.from({ length: 6 }, () => undefined)
    );
  });

  it('writes base64 padded, without spaces', () => {
    expect([[1, 2, 3], [1], [1, 2], []].map((bytes) => formatBase64(new Uint8Array(bytes)))).toEqual([
      'AQID',
      'AQ==',
      'AQI=',
      '',
    ]);
  });

  it('compares bytes in order, shorter first', () => {
    const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
    expect([
      compareBytes(bytes(1), bytes(2)),
      compareBytes(bytes(2), bytes(1)),
      compareBytes(bytes(1), bytes(1)),
    ]).toEqual([-1, 1, 0]);
    expect([compareBytes(bytes(1), bytes(1, 0)), compareBytes(bytes(1, 0), bytes(1))]).toEqual([-1, 1]);
  });
});
