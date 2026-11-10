import { isAtomicValue, isNode, isNumericType, XdmAtomicValue, type XdmItem, type XdmValue, XS } from '@exemplarjs/xdm';
import { isStringLike, numberAsBoolean } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';

const TRUE: XdmValue = [XdmAtomicValue.boolean(true)];
const FALSE: XdmValue = [XdmAtomicValue.boolean(false)];

/** A boolean as a value, one shared value for each. */
export function booleanResult(value: boolean): XdmValue {
  return value ? TRUE : FALSE;
}

/** A value's effective boolean value, as a value: `fn:boolean`. */
export function booleanOf(value: XdmValue): XdmValue {
  return booleanResult(effectiveBooleanValue(value));
}

/**
 * The effective boolean value (XPath §2.4.3): false when empty, true when it starts with a node, a
 * boolean, non-empty text, or a number neither zero nor NaN; FORG0006 for anything else, such as a
 * function item.
 */
export function effectiveBooleanValue(value: XdmValue): boolean {
  if (value.length === 0) return false;
  const first = value[0] as XdmItem;
  if (isNode(first)) return true;
  if (!isAtomicValue(first)) return noBooleanValue('a function item');
  if (value.length > 1) return noBooleanValue('a sequence of more than one item starting with an atomic value');
  return atomicTruth(first);
}

/** The effective boolean value of one atomic value. */
function atomicTruth(value: XdmAtomicValue): boolean {
  const type = value.type;
  if (type === XS.boolean) return value.value as boolean;
  if (isStringLike(type)) return (value.value as string).length > 0;
  if (!isNumericType(type)) return noBooleanValue(`a value of type ${type.toString()}`);
  return numberAsBoolean(value);
}

/** Raises FORG0006 for a value that has no effective boolean value. */
function noBooleanValue(what: string): never {
  return dynamicError(XPathErrorCode.NO_BOOLEAN_VALUE, `There is no effective boolean value of ${what}`);
}
