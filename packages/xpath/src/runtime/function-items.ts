import { EMPTY_SEQUENCE, isArray, isMap, type XdmAtomicValue, XdmFunction, type XdmValue } from '@exemplarjs/xdm';
import type { QName } from '@exemplarjs/xml';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { convertArgument } from '@/functions/function-conversion';
import { type FunctionSignature, type SequenceTypeMatcher, signatureOf, type SignedFunction } from '@/static/matchers';
import type { Pausable } from './pausing.ts';

/** What a function item does with its arguments, already converted to its parameter types: its result, or a promise of it while a resource is pending. */
export type FunctionBody = (args: readonly XdmValue[]) => Pausable<XdmValue>;

/**
 * A function item that XPath made: from an inline function, a function reference, a partial
 * application or `function-lookup`. It has a name when it was named, a signature by which its
 * arguments are converted and its type tested, and a body.
 *
 * @example
 * const double = new FunctionItem(undefined, signature, ([n]) => numericArithmetic('*', ...));
 * callFunction(double, [[XdmAtomicValue.integer(2n)]]); // [4]
 */
export class FunctionItem extends XdmFunction implements SignedFunction {
  readonly name: QName | undefined;
  readonly arity: number;
  readonly signature: FunctionSignature;
  readonly body: FunctionBody;

  constructor(name: QName | undefined, signature: FunctionSignature, body: FunctionBody) {
    super();
    this.name = name;
    this.arity = signature.parameterTypes.length;
    this.signature = signature;
    this.body = body;
  }
}

/** How a function is named in messages: by its name and arity, or as an anonymous function. */
export function describeFunction(item: XdmFunction): string {
  if (isMap(item)) return 'the map';
  if (isArray(item)) return 'the array';
  const name = item.name;
  return name === undefined ? 'the anonymous function' : `${name.toString()}#${item.arity}`;
}

/** Raises XPTY0004 unless a function is given as many arguments as its arity. */
export function checkArity(item: XdmFunction, count: number): void {
  if (count !== item.arity)
    dynamicError(XPathErrorCode.TYPE_MISMATCH, `${describeFunction(item)} takes ${item.arity} arguments, not ${count}`);
}

/** The argument at a position, from 0, converted to the function's parameter type there, named in errors by both. */
export function convertedArgument(item: XdmFunction, value: XdmValue, index: number): XdmValue {
  const type = signatureOf(item).parameterTypes[index] as SequenceTypeMatcher;
  return convertArgument(value, type, () => `Argument ${index + 1} of ${describeFunction(item)}`);
}

/** Raises FOAY0001 for a position outside an array of some size. */
export function outsideArray(position: bigint | number, size: number): never {
  return dynamicError(
    XPathErrorCode.ARRAY_INDEX_OUT_OF_BOUNDS,
    `Position ${position} is outside an array of ${size} members`
  );
}

/** Runs a function item on arguments already converted: a map gives a key's value, an array a position's member; FOAY0001 outside it. */
export function invoke(item: XdmFunction, args: readonly XdmValue[]): Pausable<XdmValue> {
  if (!isMap(item) && !isArray(item)) return (item as FunctionItem).body(args);
  const key = (args[0] as XdmValue)[0] as XdmAtomicValue;
  if (isMap(item)) return item.get(key) ?? EMPTY_SEQUENCE;
  const position = key.value as bigint;
  if (position < 1n || position > BigInt(item.size)) return outsideArray(position, item.size);
  return item.members[Number(position) - 1] as XdmValue;
}

/** Calls a function item with arguments, each converted to its parameter type by the function conversion rules; XPTY0004 for the wrong number. */
export function callFunction(item: XdmFunction, args: readonly XdmValue[]): Pausable<XdmValue> {
  checkArity(item, args.length);
  return invoke(
    item,
    args.map((value, index) => convertedArgument(item, value, index))
  );
}
