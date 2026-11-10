import {
  type AtomicType,
  atomicType,
  castAs,
  type CastOptions,
  EMPTY_SEQUENCE,
  isNumericType,
  XdmAtomicValue,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { isTextType } from '@exemplarjs/xdm/internal';
import { splitWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { NamespaceContext } from '@/static/static-context';
import { type UnionTypeName, unionTypeNamed } from '@/static/type-resolution';
import { atomizeOptional } from './atomization.ts';

/** What a cast targets: an atomic type, a union type, or a list type, by its item type. */
export type CastTarget = AtomicType | UnionTypeName | { readonly listOf: AtomicType };

/** The list types a cast can target, by local name, with the type of their items. */
export const LIST_TYPES: Readonly<Record<string, AtomicType>> = {
  NMTOKENS: XS.NMTOKEN,
  IDREFS: XS.IDREF,
  ENTITIES: XS.ENTITY,
};

/**
 * The target of the constructor function with a local name in the XML Schema namespace: any
 * atomic type that is not abstract, the unions `xs:numeric` and `xs:error`, and the list types;
 * undefined when there is no such constructor.
 */
export function constructorTarget(localName: string): CastTarget | undefined {
  const union = unionTypeNamed(localName);
  if (union !== undefined) return union;
  const listOf = LIST_TYPES[localName];
  if (listOf !== undefined) return { listOf };
  const type = atomicType(localName);
  if (type === undefined || type.abstract || type === XS.anyAtomicType) return undefined;
  return type;
}

/** A string or untyped value cast to a list type, token by token (F&O §19.3.6); XPTY0004 for other values, FORG0001 for no tokens. */
function castToList(value: XdmAtomicValue, itemType: AtomicType): XdmValue {
  if (!isTextType(value.type))
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, 'Only strings and untyped values can be cast to a list type');
  const tokens = splitWhitespace(String(value.value));
  if (tokens.length === 0)
    return dynamicError(XPathErrorCode.INVALID_VALUE_FOR_CAST, 'A list must have at least one item');
  return tokens.map((token) => castAs(XdmAtomicValue.string(token), itemType));
}

/** One value cast to a target: to `xs:numeric` a number as it is and anything else as a double, nothing to `xs:error`, a list item by item. */
function castOne(value: XdmAtomicValue, target: CastTarget, options: CastOptions): XdmValue {
  if (target === 'xs:numeric') return [isNumericType(value.type) ? value : castAs(value, XS.double, options)];
  if (target === 'xs:error')
    return dynamicError(XPathErrorCode.INVALID_VALUE_FOR_CAST, 'No value can be cast to xs:error');
  if ('listOf' in target) return castToList(value, target.listOf);
  return [castAs(value, target, options)];
}

/** The options a cast in a static context uses: its namespaces resolve a cast to `xs:QName`, the default element namespace for no prefix. */
export function castOptions(context: NamespaceContext): CastOptions {
  return {
    resolvePrefix: (prefix) => (prefix === '' ? context.defaultElementNamespace : context.resolvePrefix(prefix)),
  };
}

/** Whether a constructor function takes the empty sequence, as `xs:integer(())` does: it casts to the type with `?`. */
const CONSTRUCTOR_ALLOWS_EMPTY = true;

/**
 * A value cast to a target, as `cast as` does: atomized to at most one value; the empty sequence
 * stays empty when `allowsEmpty`, as the type's `?` says, and raises XPTY0004 otherwise.
 */
export function castValue(value: XdmValue, target: CastTarget, options: CastOptions, allowsEmpty: boolean): XdmValue {
  const atomic = atomizeOptional(value, 'The operand of a cast');
  if (atomic !== undefined) return castOne(atomic, target, options);
  if (allowsEmpty) return EMPTY_SEQUENCE;
  return dynamicError(XPathErrorCode.TYPE_MISMATCH, 'The empty sequence cannot be cast to a type without "?"');
}

/** The cast a constructor function makes, such as `xs:integer($a)`: `$a cast as xs:integer?`. */
export function constructorCast(target: CastTarget, options: CastOptions): (value: XdmValue) => XdmValue {
  return (value) => castValue(value, target, options, CONSTRUCTOR_ALLOWS_EMPTY);
}
