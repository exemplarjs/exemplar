import { XdmArray, XdmAtomicValue, type XdmItem, XdmMap, XdmNode, type XdmValue } from '@exemplarjs/xdm';
import { convertArgument } from '@/functions/function-conversion';
import { FunctionItem } from '@/runtime/function-items';
import { atomicTypeOf, type ItemMatcher, type SequenceTypeMatcher } from '@/static/matchers';
import { atomicFromJS, type Converters } from './converters.ts';

/** A variable as compiled: its name for messages, its slot, and its declared type when it has one. */
export interface BoundVariable {
  readonly name: string;
  readonly slot: number;
  readonly type: SequenceTypeMatcher | undefined;
}

/** Whether a value is an item XPath can use as it is: a node, an atomic value, a map, an array, or a function item XPath made. */
function isItem(value: unknown): value is XdmItem {
  return (
    value instanceof XdmNode ||
    value instanceof XdmAtomicValue ||
    value instanceof XdmMap ||
    value instanceof XdmArray ||
    value instanceof FunctionItem
  );
}

/** Whether a value is a plain object, made by a literal or `Object.create(null)`, not an instance of a class. */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Entries as a map, their keys and values converted to the key and value types of a declared map type. */
function mapOf(
  entries: Iterable<readonly [unknown, unknown]>,
  itemType: ItemMatcher | undefined,
  converters: Converters
): XdmMap {
  const shape = itemType?.shape.kind === 'map' ? itemType.shape : undefined;
  const keyType = atomicTypeOf(shape?.keyType);
  const valueType = shape?.valueType?.itemType;
  return XdmMap.of(
    [...entries].map(
      ([key, value]) => [atomicFromJS(key, keyType, converters), valueOf(value, valueType, converters)] as const
    )
  );
}

/** A list within a list as an array, each element a member converted as a value of its own, to a declared array type's member type. */
function arrayOf(elements: readonly unknown[], itemType: ItemMatcher | undefined, converters: Converters): XdmArray {
  const memberType = itemType?.shape.kind === 'array' ? itemType.shape.memberType?.itemType : undefined;
  return XdmArray.of(elements.map((element) => valueOf(element, memberType, converters)));
}

/** One JavaScript value as an item: items as they are, a `Map` or plain object as a map, anything else by the converters. */
function itemOf(value: unknown, itemType: ItemMatcher | undefined, converters: Converters): XdmItem {
  if (isItem(value)) return value;
  if (value instanceof Map) return mapOf(value as ReadonlyMap<unknown, unknown>, itemType, converters);
  if (isPlainObject(value)) return mapOf(Object.entries(value), itemType, converters);
  return atomicFromJS(value, atomicTypeOf(itemType), converters);
}

/**
 * A JavaScript value as a sequence: null and undefined none, a list its
 * elements in turn, a list within it an array, and anything else one item.
 */
function valueOf(value: unknown, itemType: ItemMatcher | undefined, converters: Converters): XdmItem[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return [itemOf(value, itemType, converters)];
  return value.flatMap((element: unknown) =>
    Array.isArray(element) ? [arrayOf(element, itemType, converters)] : valueOf(element, itemType, converters)
  );
}

/** A JavaScript value as a variable's value, converted to the declared type by the function conversion rules, or XPTY0004. */
export function bindValue(value: unknown, variable: BoundVariable, converters: Converters): XdmValue {
  const type = variable.type;
  const items = valueOf(value, type?.itemType, converters);
  return type === undefined ? items : convertArgument(items, type, () => `The variable $${variable.name}`);
}
