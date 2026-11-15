import { XPathErrorCode, XdmError, xdmError } from '@/errors';
import { inIntegerRange } from '@/numeric/integer';
import type { PrefixResolver } from '@/text/qname-value';
import { applyWhitespace, isTextType, whitespaceOf } from '@/text/string-values';
import { type AtomicType, isIntegerType, isNumericType, XS } from '@/types/built-in-types';
import { type AtomicContent, uncheckedAtomicValue, type XdmAtomicValue } from '@/values/atomic-value';
import { contentFromText, DEFAULT_PREFIXES } from './cast-from-string.ts';
import { canonicalString } from './cast-to-string.ts';
import { castDateTime } from './date-time-casts.ts';
import { castNumericContent } from './numeric-casts.ts';

/** What a cast may need beyond the value and the target type. */
export interface CastOptions {
  /** Resolves the prefixes of QNames cast from strings: the static context's namespaces, `xml` and none by default. */
  readonly resolvePrefix?: PrefixResolver;
}

/** Whether a type's values are numbers or booleans, which cast among each other. */
function isNumericOrBoolean(type: AtomicType): boolean {
  return isNumericType(type) || type.primitive === XS.boolean;
}

/** The binary types, which cast to each other. */
const BINARY_TYPES: ReadonlySet<AtomicType> = new Set([XS.hexBinary, XS.base64Binary]);

/** Whether two different primitive types, other than text, numbers and booleans, cast to each other; nothing casts to the abstract NOTATION. */
function castsBetweenOthers(source: AtomicType, target: AtomicType): boolean {
  if (BINARY_TYPES.has(source) && BINARY_TYPES.has(target)) return true;
  return source === XS.NOTATION && target === XS.QName;
}

/** A cast of a value of one type to another the cast table does not allow: XPTY0004. */
function notCastable(value: XdmAtomicValue, target: AtomicType): never {
  return xdmError(
    XPathErrorCode.TYPE_MISMATCH,
    `A value of type ${value.type.toString()} cannot be cast to ${target.toString()}`
  );
}

/** The value of a target type with some content, checked against the integer range the type allows. */
function checked(content: AtomicContent, target: AtomicType, from: XdmAtomicValue): XdmAtomicValue {
  if (isIntegerType(target) && !inIntegerRange(content as bigint, target)) {
    return xdmError(
      XPathErrorCode.INVALID_VALUE_FOR_CAST,
      `${from.stringValue} is outside the range of ${target.toString()}`
    );
  }
  // Every path here has checked the content, so the value is made without checking it again.
  return uncheckedAtomicValue(target, content);
}

/** Casts text, as from `xs:string` or `xs:untypedAtomic`, to a type: whitespace handled, then read as the type's lexical form. */
function castText(text: string, from: XdmAtomicValue, target: AtomicType, resolve: PrefixResolver): XdmAtomicValue {
  const content = contentFromText(applyWhitespace(text, whitespaceOf(target)), target, resolve);
  if (content === undefined) {
    return xdmError(
      XPathErrorCode.INVALID_VALUE_FOR_CAST,
      `${JSON.stringify(text)} is not a valid ${target.toString()}`
    );
  }
  return checked(content, target, from);
}

/**
 * Casts an atomic value to a built-in atomic type, as `cast as` does (F&O §19): through text for
 * the string types, by value among numbers and booleans, and by the cast table otherwise.
 *
 * ```ts
 * castAs(XdmAtomicValue.string(' 42 '), XS.integer).value; // 42n
 * castAs(XdmAtomicValue.double(2.9), XS.integer).value; // 2n
 * ```
 *
 * Raises FORG0001 for a value the target cannot hold, FOCA0002 for NaN or an infinity cast to a
 * decimal, XPTY0004 for a pair of types that do not cast, and XPST0080 for an abstract target.
 */
export function castAs(value: XdmAtomicValue, target: AtomicType, options: CastOptions = {}): XdmAtomicValue {
  if (target.abstract)
    return xdmError(XPathErrorCode.CAST_TO_ABSTRACT_TYPE, `Nothing can be cast to ${target.toString()}`);
  if (value.type === target) return value;
  const source = value.type.primitive;
  const resolve = options.resolvePrefix ?? DEFAULT_PREFIXES;
  if (isTextType(value.type)) {
    return castText(value.value as string, value, target, resolve);
  }
  if (isTextType(target)) {
    return castText(canonicalString(value), value, target, resolve);
  }
  if (isNumericOrBoolean(value.type) && isNumericOrBoolean(target)) {
    return checked(castNumericContent(value, target), target, value);
  }
  const dateTime = castDateTime(value, target);
  if (dateTime !== undefined) return dateTime;
  if (source === target.primitive || castsBetweenOthers(source, target.primitive)) {
    return uncheckedAtomicValue(target, value.value);
  }
  return notCastable(value, target);
}

/** Casts a value to a type as {@link castAs} does, or gives undefined where the cast fails; XPST0080 is still raised. */
export function tryCastAs(
  value: XdmAtomicValue,
  target: AtomicType,
  options: CastOptions = {}
): XdmAtomicValue | undefined {
  try {
    return castAs(value, target, options);
  } catch (error) {
    if (error instanceof XdmError && error.code !== XPathErrorCode.CAST_TO_ABSTRACT_TYPE) return undefined;
    throw error;
  }
}

/** Whether a value can be cast to a type, as `castable as` asks. */
export function isCastable(value: XdmAtomicValue, target: AtomicType, options: CastOptions = {}): boolean {
  return tryCastAs(value, target, options) !== undefined;
}
