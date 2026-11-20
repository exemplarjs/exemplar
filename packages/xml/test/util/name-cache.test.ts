import { describe, expect, it } from 'vitest';
import { NameCache } from '@/util/name-cache';

describe('NameCache', () => {
  it('holds the names added to it, and no empty name', () => {
    const names = new NameCache();
    expect([names.has('title'), names.has('')]).toEqual([false, false]);
    names.add('title');
    names.add('p:title');
    expect([names.has('title'), names.has('p:title'), names.has('titles'), names.has('')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('tells apart names that share a place, the later one replacing the earlier', () => {
    // The same length and the same first, middle and last characters.
    const names = new NameCache();
    names.add('abcd');
    expect([names.has('abcd'), names.has('aecd')]).toEqual([true, false]);
    names.add('aecd');
    expect([names.has('abcd'), names.has('aecd')]).toEqual([false, true]);
  });

  it('keeps each cache its own names', () => {
    const names = new NameCache();
    names.add('title');
    expect(new NameCache().has('title')).toBe(false);
  });
});
