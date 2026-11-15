import { XdmNode } from '@/node/xdm-node';
import { XdmArray } from '@/structures/xdm-array';
import { XdmFunction } from '@/structures/xdm-function';
import { XdmMap } from '@/structures/xdm-map';
import { XdmAtomicValue } from './atomic-value.ts';

/** One item of a sequence: a node, an atomic value or a function item, which maps and arrays are. */
export type XdmItem = XdmNode | XdmAtomicValue | XdmFunction;

/** A sequence of items, the value of every XPath expression; a single item is a sequence of one. */
export type XdmValue = readonly XdmItem[];

/** The empty sequence, shared. */
export const EMPTY_SEQUENCE: XdmValue = Object.freeze([]);

/** Whether an item is an atomic value. */
export function isAtomicValue(item: XdmItem): item is XdmAtomicValue {
  return item instanceof XdmAtomicValue;
}

/** Whether an item is a node. */
export function isNode(item: XdmItem): item is XdmNode {
  return item instanceof XdmNode;
}

/** Whether an item is a function item, which maps and arrays are too. */
export function isFunction(item: XdmItem): item is XdmFunction {
  return item instanceof XdmFunction;
}

/** Whether an item is a map. */
export function isMap(item: XdmItem): item is XdmMap {
  return item instanceof XdmMap;
}

/** Whether an item is an array. */
export function isArray(item: XdmItem): item is XdmArray {
  return item instanceof XdmArray;
}
