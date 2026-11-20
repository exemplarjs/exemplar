import { describe, expect, it } from 'vitest';
import { LruCache } from '@/util/lru-cache';

/** A cache of text lengths, with each text it computed for, in order. */
function lengths(capacity: number): { computed: string[]; of: (text: string) => number } {
  const cache = new LruCache<string, number>(capacity);
  const computed: string[] = [];
  const of = (text: string): number =>
    cache.computeIfAbsent(text, (key) => {
      computed.push(key);
      return key.length;
    });
  return { computed, of };
}

describe('LruCache', () => {
  it('computes a value once for a key used again', () => {
    const { computed, of } = lengths(2);
    expect([of('abc'), of('abc'), of('de'), of('abc')]).toEqual([3, 3, 2, 3]);
    expect(computed).toEqual(['abc', 'de']);
  });

  it('drops the entry used longest ago when it is full, not the one added first', () => {
    const { computed, of } = lengths(2);
    of('a');
    of('b');
    of('a');
    of('c');
    of('a');
    of('b');
    expect(computed).toEqual(['a', 'b', 'c', 'b']);
  });

  it('holds a value of undefined like any other, and no error', () => {
    const cache = new LruCache<string, string | undefined>(2);
    let computed = 0;
    const absent = (): undefined => {
      computed++;
      return undefined;
    };
    expect([cache.computeIfAbsent('a', absent), cache.computeIfAbsent('a', absent)]).toEqual([undefined, undefined]);
    cache.computeIfAbsent('b', () => 'b');
    expect(cache.computeIfAbsent('a', absent)).toBeUndefined();
    expect(computed).toBe(1);
    const failing = (): string => {
      computed++;
      throw new Error('not computed');
    };
    expect(() => cache.computeIfAbsent('c', failing)).toThrow('not computed');
    expect(() => cache.computeIfAbsent('c', failing)).toThrow('not computed');
    expect(computed).toBe(3);
  });

  it('lets a computation use the cache it is computing for', () => {
    const cache = new LruCache<string, string>(2);
    const nested = cache.computeIfAbsent('outer', () => `${cache.computeIfAbsent('inner', () => 'in')}side`);
    expect(nested).toBe('inside');
    expect(cache.computeIfAbsent('inner', () => 'again')).toBe('in');
    expect(cache.computeIfAbsent('outer', () => 'again')).toBe('inside');
  });

  it('takes keys of any kind', () => {
    const cache = new LruCache<object, string>(1);
    const key = {};
    expect(cache.computeIfAbsent(key, () => 'first')).toBe('first');
    expect(cache.computeIfAbsent(key, () => 'second')).toBe('first');
    expect(cache.computeIfAbsent({}, () => 'other')).toBe('other');
    expect(cache.computeIfAbsent(key, () => 'again')).toBe('again');
  });
});
