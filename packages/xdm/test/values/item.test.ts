import { parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { type QName } from '@exemplarjs/xml';
import {
  EMPTY_SEQUENCE,
  isArray,
  isAtomicValue,
  isFunction,
  isMap,
  isNode,
  XdmArray,
  XdmAtomicValue,
  XdmFunction,
  XdmMap,
} from '@/index';

/** A function item that is neither a map nor an array. */
class Constant extends XdmFunction {
  readonly name: QName | undefined = undefined;
  readonly arity = 0;
}

describe('items', () => {
  it('tells atomic values from nodes', () => {
    const document = parse('<a/>');
    const value = XdmAtomicValue.integer(1n);
    expect([isAtomicValue(value), isAtomicValue(document), isNode(document), isNode(value)]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('tells function items, maps and arrays apart', () => {
    const items = [new Constant(), XdmMap.EMPTY, XdmArray.EMPTY, XdmAtomicValue.integer(1n), parse('<a/>')];
    expect(items.map((item) => isFunction(item))).toEqual([true, true, true, false, false]);
    expect(items.map((item) => isMap(item))).toEqual([false, true, false, false, false]);
    expect(items.map((item) => isArray(item))).toEqual([false, false, true, false, false]);
  });

  it('shares one frozen empty sequence', () => {
    expect(EMPTY_SEQUENCE).toEqual([]);
    expect(Object.isFrozen(EMPTY_SEQUENCE)).toBe(true);
  });
});
