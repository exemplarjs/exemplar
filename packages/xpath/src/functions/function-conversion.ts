import {
  type AtomicType,
  castAs,
  derivesFrom,
  isAtomicValue,
  isFunction,
  isNode,
  isNumericType,
  type XdmAtomicValue,
  type XdmItem,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { uncheckedAtomicValue } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { atomize, isUntyped } from '@/runtime/atomization';
import { callFunction, describeFunction, FunctionItem } from '@/runtime/function-items';
import { after } from '@/runtime/pausing';
import {
  atomicTypeOf,
  type FunctionSignature,
  isAtomized,
  type ItemMatcher,
  type SequenceTypeMatcher,
} from '@/static/matchers';

/** A value promoted to a type when XPath allows it: numbers up to `xs:float` or `xs:double`, `xs:anyURI` to `xs:string`. */
function promoted(value: XdmAtomicValue, target: AtomicType): XdmAtomicValue {
  if (derivesFrom(value.type, target)) return value;
  const type = value.type;
  if (target === XS.double && isNumericType(type)) return castAs(value, XS.double);
  if (target === XS.float && isNumericType(type) && type.primitive !== XS.double) return castAs(value, XS.float);
  if (target === XS.string && derivesFrom(type, XS.anyURI)) return castAs(value, XS.string);
  return value;
}

/** One atomized value converted for an atomic item type: untyped values cast to it, others promoted. */
function convertAtomic(value: XdmAtomicValue, itemType: ItemMatcher): XdmAtomicValue {
  const target = atomicTypeOf(itemType);
  if (isUntyped(value)) {
    if (itemType.shape.kind === 'numeric') return castAs(value, XS.double);
    if (target === undefined || target === XS.anyAtomicType || target === XS.untypedAtomic) return value;
    // Any untyped text is a string as it is.
    if (target === XS.string) return uncheckedAtomicValue(XS.string, value.value);
    if (target === XS.QName || target === XS.NOTATION)
      return dynamicError(XPathErrorCode.UNTYPED_TO_QNAME, 'An untyped value cannot be converted to a QName');
    return castAs(value, target);
  }
  return target === undefined ? value : promoted(value, target);
}

/** An item as an error message names it: an atomic value by its type, a node by its kind, a function as itself. */
function describeItem(item: XdmItem): string {
  if (isAtomicValue(item)) return `a value of type ${item.type.toString()}`;
  return isNode(item) ? `a node of kind ${item.kindName}` : describeFunction(item);
}

/**
 * A function item coerced to a function type (§3.1.5.3): one of the same arity whose signature
 * does not already fit is wrapped, so that its arguments and result are converted to the type's.
 */
function coerceFunction(item: XdmItem, itemType: ItemMatcher, signature: FunctionSignature): XdmItem {
  if (!isFunction(item) || item.arity !== signature.parameterTypes.length || itemType.matches(item)) return item;
  const returnType = signature.returnType;
  const convert = (result: XdmValue) =>
    convertArgument(result, returnType, () => `The result of ${describeFunction(item)}`);
  return new FunctionItem(item.name, signature, (args) => after(callFunction(item, args), convert));
}

/** A value converted for an item type: atomized and cast or promoted for an atomic type, functions coerced to a function type. */
function convertItems(value: XdmValue, itemType: ItemMatcher | undefined): XdmValue {
  if (itemType === undefined) return value;
  const shape = itemType.shape;
  if (isAtomized(shape)) return atomize(value).map((item) => convertAtomic(item, itemType));
  if (shape.kind !== 'function' || shape.signature === undefined) return value;
  const signature = shape.signature;
  return value.map((item) => coerceFunction(item, itemType, signature));
}

/**
 * A value converted by the function conversion rules (§3.1.5.2): for an atomic type atomized, untyped
 * values cast and numbers promoted, and for a function type functions coerced; then checked,
 * raising XPTY0004 named by `describe`.
 */
export function convertArgument(value: XdmValue, type: SequenceTypeMatcher, describe: () => string): XdmValue {
  const converted = convertItems(value, type.itemType);
  if (!type.matches(converted)) {
    const given = converted.length === 1 ? describeItem(converted[0] as XdmItem) : `${converted.length} items`;
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, `${describe()} must be ${type.text}, but was given ${given}`);
  }
  return converted;
}
