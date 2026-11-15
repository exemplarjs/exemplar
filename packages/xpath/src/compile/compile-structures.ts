import {
  isArray,
  isMap,
  type MapEntry,
  XdmArray,
  type XdmAtomicValue,
  type XdmItem,
  XdmMap,
  type XdmValue,
} from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { atomize, atomizeOptional } from '@/runtime/atomization';
import type { DynamicContext, Evaluator } from '@/runtime/dynamic-context';
import { callFunction } from '@/runtime/function-items';
import type {
  CurlyArrayConstructor,
  Lookup,
  LookupKey,
  MapConstructor,
  SquareArrayConstructor,
  UnaryLookup,
} from '@/syntax/syntax-tree';
import { compile, type CompileState } from './compiler.ts';

/** A map key: one atomic value; XPTY0004 for none or several. */
function mapKey(value: XdmValue): XdmAtomicValue {
  const key = atomizeOptional(value, 'A map key');
  return key ?? dynamicError(XPathErrorCode.TYPE_MISMATCH, 'A map key must be one value, not the empty sequence');
}

/** Raises XQDY0137 for a key a map constructor gives twice. */
function duplicateKey([key]: MapEntry): never {
  return dynamicError(XPathErrorCode.DUPLICATE_MAP_KEY, `The map constructor gives the key ${String(key.value)} twice`);
}

/** Compiles `map { key: value, ... }`; XQDY0137 when two keys are the same. */
export function compileMapConstructor(constructor: MapConstructor, state: CompileState): Evaluator {
  const entries = constructor.entries.map((entry) => ({
    key: compile(entry.key, state),
    value: compile(entry.value, state),
  }));
  return (context) => [
    XdmMap.of(
      entries.map((entry) => [mapKey(entry.key(context)), entry.value(context)] as const),
      duplicateKey
    ),
  ];
}

/** Compiles `[a, b]`: an array with the value of each expression as a member. */
export function compileSquareArray(constructor: SquareArrayConstructor, state: CompileState): Evaluator {
  const members = constructor.members.map((member) => compile(member, state));
  return (context) => [XdmArray.of(members.map((member) => member(context)))];
}

/** Compiles `array { a, b }`: an array with each item of the expression as a member. */
export function compileCurlyArray(constructor: CurlyArrayConstructor, state: CompileState): Evaluator {
  const content = compile(constructor.content, state);
  return (context) => [XdmArray.of(content(context).map((item) => [item]))];
}

/** The values a lookup gives from one map or array: for `*` every value or member, else the result of calling it with each key. */
function lookUp(item: XdmItem, keys: readonly XdmAtomicValue[] | '*'): XdmValue {
  if (!isMap(item) && !isArray(item))
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, 'A lookup must be made on maps and arrays');
  if (keys === '*') return isMap(item) ? [...item.entries()].flatMap(([, value]) => value) : item.members.flat();
  // Calling a map or array never pauses, so the result is a value, not a promise.
  return keys.flatMap((key) => callFunction(item, [[key]]) as XdmValue);
}

/** Compiles a lookup's key: `*`, or an expression whose atomized values are the keys, evaluated with the lookup's focus. */
function compileKeys(
  key: LookupKey,
  state: CompileState
): (context: DynamicContext) => readonly XdmAtomicValue[] | '*' {
  if (key === '*') return () => '*';
  const keys = compile(key, state);
  return (context) => atomize(keys(context));
}

/** Compiles `base?key`: the key looked up in each map or array the base gives. */
export function compileLookup(lookup: Lookup, state: CompileState): Evaluator {
  const base = compile(lookup.base, state);
  const keys = compileKeys(lookup.key, state);
  return (context) => {
    const items = base(context);
    const keyValues = keys(context);
    return items.flatMap((item) => lookUp(item, keyValues));
  };
}

/** Compiles `?key`: the key looked up in the context item. */
export function compileUnaryLookup(lookup: UnaryLookup, state: CompileState): Evaluator {
  const keys = compileKeys(lookup.key, state);
  return (context) => lookUp(context.contextItem(), keys(context));
}
