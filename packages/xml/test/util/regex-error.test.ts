import { describe, expect, it } from 'vitest';
import { RegexError } from '@/util/regex-error';

describe('RegexError', () => {
  it('names the pattern, the character and the reason', () => {
    const error = new RegexError('invalid-pattern', 'this range ends before it starts', '[z-a]', 1);
    expect([error.name, error.message, error.kind, error.reason, error.pattern, error.index]).toEqual([
      'RegexError',
      'Invalid regular expression "[z-a]" at character 2: this range ends before it starts',
      'invalid-pattern',
      'this range ends before it starts',
      '[z-a]',
      1,
    ]);
    expect(error).toBeInstanceOf(Error);
  });

  it('names the flags when they are at fault', () => {
    const error = new RegexError('invalid-flags', 'XML Schema patterns take no flags', 'i', undefined);
    expect(error.message).toBe('Invalid regular expression flags "i": XML Schema patterns take no flags');
  });
});
