import { describe, expect, it } from 'vitest';
import { remembered } from '@/util/remembered';

describe('remembered', () => {
  it('computes a result once for a string given again', () => {
    const asked: string[] = [];
    const length = remembered((text) => {
      asked.push(text);
      return { length: text.length };
    });
    expect(length('abc')).toBe(length('abc'));
    expect(length('de')).toHaveLength(2);
    expect(asked).toEqual(['abc', 'de']);
  });

  it('drops the oldest result past its limit, and keeps no error', () => {
    const asked: string[] = [];
    const echo = remembered((text) => {
      asked.push(text);
      if (text === 'bad') throw new Error('bad picture');
      return text;
    });
    for (let index = 0; index <= 100; index++) echo(String(index));
    echo('100');
    echo('0');
    expect(asked).toHaveLength(102);
    expect(() => echo('bad')).toThrow('bad picture');
    expect(() => echo('bad')).toThrow('bad picture');
    expect(asked.filter((text) => text === 'bad')).toHaveLength(2);
  });
});

describe('remembered with a limit', () => {
  it('keeps only as many results as its limit', () => {
    const asked: string[] = [];
    const echo = remembered((text) => {
      asked.push(text);
      return text;
    }, 1);
    echo('a');
    echo('b');
    echo('a');
    expect(asked).toEqual(['a', 'b', 'a']);
  });
});
