import type { QName } from '@exemplarjs/xml';
import type { XdmValue } from '@/values/item';
import { XdmFunction } from './xdm-function.ts';

/**
 * An array: an ordered list of members, each a sequence of any length, immutable. Unlike a
 * sequence, an array can hold an empty member or a member of several items, and arrays nest.
 *
 * ```ts
 * const array = XdmArray.of([[XdmAtomicValue.integer(1n)], [], [XdmAtomicValue.integer(2n), XdmAtomicValue.integer(3n)]]);
 * array.size; // 3
 * array.members[2].length; // 2
 * ```
 *
 * As a function, an array takes a position from 1 and returns that member; XPath's calls raise its
 * errors for a position outside the array.
 */
export class XdmArray extends XdmFunction {
  /** The empty array, shared. */
  static readonly EMPTY: XdmArray = new XdmArray([]);

  /** The members, in order. */
  readonly members: readonly XdmValue[];

  private constructor(members: readonly XdmValue[]) {
    super();
    this.members = members;
  }

  /** An array of members, in order. */
  static of(members: readonly XdmValue[]): XdmArray {
    return members.length === 0 ? XdmArray.EMPTY : new XdmArray(members);
  }

  get name(): QName | undefined {
    return undefined;
  }

  get arity(): number {
    return 1;
  }

  /** How many members the array has. */
  get size(): number {
    return this.members.length;
  }
}
