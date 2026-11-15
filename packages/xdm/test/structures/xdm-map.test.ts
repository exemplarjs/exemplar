import { describe, expect, it } from 'vitest';
import { type MapEntry, XdmAtomicValue, XdmFunction, XdmMap } from '@/index';

const key = (text: string): XdmAtomicValue => XdmAtomicValue.string(text);
const number = (value: number): XdmAtomicValue => XdmAtomicValue.integer(value);

describe('XdmMap', () => {
  it('shares one empty map', () => {
    expect(XdmMap.of([])).toBe(XdmMap.EMPTY);
    expect(XdmMap.EMPTY.size).toBe(0);
  });

  it('is a function item of one argument without a name', () => {
    const map = XdmMap.of([[key('a'), [number(1)]]]);
    expect(map).toBeInstanceOf(XdmFunction);
    expect([map.arity, map.name]).toEqual([1, undefined]);
  });

  it('looks up values by keys compared as same-key', () => {
    const map = XdmMap.of([[number(1), [key('one')]]]);
    expect(map.get(XdmAtomicValue.double(1))).toEqual([key('one')]);
    expect(map.has(XdmAtomicValue.float(1))).toBe(true);
    expect(map.get(key('1'))).toBeUndefined();
    expect(map.has(key('1'))).toBe(false);
  });

  it('keeps the later entry of a key given twice, unless told otherwise', () => {
    const entries: MapEntry[] = [
      [key('a'), [number(1)]],
      [XdmAtomicValue.untypedAtomic('a'), [number(2)]],
    ];
    expect(XdmMap.of(entries).get(key('a'))).toEqual([number(2)]);
    const first = XdmMap.of(entries, (existing) => existing);
    expect([first.size, first.get(key('a'))]).toEqual([1, [number(1)]]);
  });

  it('lists keys and entries in the order they were added', () => {
    const map = XdmMap.of([
      [key('b'), [number(2)]],
      [key('a'), []],
    ]);
    expect(map.keys()).toEqual([key('b'), key('a')]);
    expect([...map.entries()]).toEqual([
      [key('b'), [number(2)]],
      [key('a'), []],
    ]);
  });

  it('puts an entry into a new map, replacing one of the same key', () => {
    const map = XdmMap.of([[key('a'), [number(1)]]]);
    const added = map.put(key('b'), [number(2)]);
    const replaced = map.put(XdmAtomicValue.untypedAtomic('a'), [number(3)]);
    expect([map.size, added.size, replaced.size]).toEqual([1, 2, 1]);
    expect(replaced.get(key('a'))).toEqual([number(3)]);
    expect(replaced.keys()).toEqual([XdmAtomicValue.untypedAtomic('a')]);
  });

  it('removes keys, returning the same map when none are there', () => {
    const map = XdmMap.of([
      [key('a'), [number(1)]],
      [key('b'), [number(2)]],
    ]);
    expect(map.remove([key('a'), key('c')]).keys()).toEqual([key('b')]);
    expect(map.remove([key('c')])).toBe(map);
  });
});
