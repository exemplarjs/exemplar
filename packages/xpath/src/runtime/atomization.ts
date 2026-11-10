import {
  castAs,
  isArray,
  isAtomicValue,
  isNode,
  NodeKind,
  XdmAtomicValue,
  type XdmItem,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { uncheckedAtomicValue } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';

/** The typed value of a node: its string value, untyped, or a string for comments, processing instructions and namespaces. */
function typedValue(node: XdmNode): XdmAtomicValue {
  const kind = node.kind;
  const isString = kind === NodeKind.COMMENT || kind === NodeKind.PROCESSING_INSTRUCTION || kind === NodeKind.NAMESPACE;
  // A node's string value is text from a tree, which every string type can hold unchecked.
  return uncheckedAtomicValue(isString ? XS.string : XS.untypedAtomic, node.stringValue);
}

/** Appends an item's atomized values: an array's members atomized in turn; FOTY0013 for any other function item. */
function atomizeInto(item: XdmItem, values: XdmAtomicValue[]): void {
  if (isAtomicValue(item)) values.push(item);
  else if (isNode(item)) values.push(typedValue(item));
  else if (isArray(item)) for (const member of item.members) for (const inner of member) atomizeInto(inner, values);
  else dynamicError(XPathErrorCode.NOT_ATOMIZABLE, 'A function item cannot be atomized');
}

/** A sequence atomized, item by item: atomic values as they are, nodes as their typed values, arrays as their members. */
export function atomize(value: XdmValue): XdmAtomicValue[] {
  const values: XdmAtomicValue[] = [];
  for (const item of value) atomizeInto(item, values);
  return values;
}

/**
 * A sequence atomized to at most one value, as operators and many functions take their operands;
 * raises XPTY0004 for more than one. `what` names the operand in the message.
 */
export function atomizeOptional(value: XdmValue, what: string): XdmAtomicValue | undefined {
  const first = value[0];
  if (value.length === 1 && first !== undefined && isAtomicValue(first)) return first;
  const values = atomize(value);
  if (values.length > 1)
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, `${what} must be one value, not ${values.length}`);
  return values[0];
}

/** Whether a value is `xs:untypedAtomic`. */
export function isUntyped(value: XdmAtomicValue): boolean {
  return value.type === XS.untypedAtomic;
}

/** A value as arithmetic and aggregates take it: an untyped value cast to a double. */
export function untypedAsDouble(value: XdmAtomicValue): XdmAtomicValue {
  return isUntyped(value) ? castAs(value, XS.double) : value;
}
