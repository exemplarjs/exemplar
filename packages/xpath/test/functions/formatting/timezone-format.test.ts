import { describe, expect, it } from 'vitest';
import { formatTimezone } from '@/functions/formatting/timezone-format';

const PLAIN = { gmt: false, traditional: false };
const TRADITIONAL = { gmt: false, traditional: true };

describe('timezones', () => {
  it('write hours and minutes by the shape of the digits', () => {
    expect(
      ['01:01', '0', '00', '0000', '999', '0:01', '00~00'].map((shape) => formatTimezone(-330, shape, PLAIN))
    ).toEqual(['-05:30', '-5:30', '-05:30', '-0530', '-530', '-5:30', '-05~30']);
    expect(['0', '999'].map((shape) => formatTimezone(60, shape, PLAIN))).toEqual(['+1', '+100']);
  });

  it('use the default shape without digits, and digits of the shape family', () => {
    expect(formatTimezone(60, undefined, PLAIN)).toBe('+01:00');
    expect(formatTimezone(60, 'N', PLAIN)).toBe('+01:00');
    expect(formatTimezone(330, '\u0660\u0660:\u0660\u0660', PLAIN)).toBe('+\u0660\u0665:\u0663\u0660');
  });

  it('write GMT first for z, and Z for UTC with t', () => {
    expect(formatTimezone(0, '0', { gmt: true, traditional: false })).toBe('GMT+0');
    expect([formatTimezone(0, '0', TRADITIONAL), formatTimezone(60, '0', TRADITIONAL)]).toEqual(['Z', '+1']);
  });

  it('write military letters, or digits where there is no letter', () => {
    expect([-720, -60, 0, 60, 540, 600, 720, 330, 780].map((offset) => formatTimezone(offset, 'Z', PLAIN))).toEqual([
      'Y',
      'N',
      'Z',
      'A',
      'I',
      'K',
      'M',
      '+05:30',
      '+13:00',
    ]);
    expect(formatTimezone(undefined, 'Z', PLAIN)).toBe('J');
  });

  it('write nothing for a value without a timezone', () => {
    expect(formatTimezone(undefined, '01:01', PLAIN)).toBe('');
  });
});
