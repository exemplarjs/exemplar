import { describe, expect, it } from 'vitest';
import { XdmArray, XdmAtomicValue, XdmFunction } from '@/index';

const number = (value: number): XdmAtomicValue => XdmAtomicValue.integer(value);

describe('XdmArray', () => {
  it('shares one empty array', () => {
    expect(XdmArray.of([])).toBe(XdmArray.EMPTY);
    expect(XdmArray.EMPTY.size).toBe(0);
  });

  it('is a function item of one argument without a name', () => {
    const array = XdmArray.of([[number(1)]]);
    expect(array).toBeInstanceOf(XdmFunction);
    expect([array.arity, array.name]).toEqual([1, undefined]);
  });

  it('holds members of any length, in order', () => {
    const array = XdmArray.of([[number(1)], [], [number(2), number(3)]]);
    expect(array.size).toBe(3);
    expect(array.members).toEqual([[number(1)], [], [number(2), number(3)]]);
  });
});
