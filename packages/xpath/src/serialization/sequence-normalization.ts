import { isAtomicValue, isNode, NodeKind, type XdmItem, type XdmNode, type XdmValue } from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { flatten } from '@/functions/arrays/array-functions';
import { stringValueOf } from '@/functions/core/strings';

/** A part of a normalized sequence, in order: a node to write, or text. */
export type OutputPart = XdmNode | string;

/** Raises SENR0001 for an item the XML and text methods cannot write. */
function notSerializable(what: string): never {
  return dynamicError(XPathErrorCode.NOT_SERIALIZABLE, `${what} cannot be serialized by the XML or text method`);
}

/**
 * A value made ready for the XML and text methods, as Serialization 3.1 §2 normalizes a sequence:
 * arrays flattened, atomic values as text with a space between adjacent ones, or the item
 * separator between every item, and documents as their children; SENR0001 for attributes,
 * namespaces, maps and functions.
 */
export function normalizedSequence(value: XdmValue, itemSeparator: string | undefined): OutputPart[] {
  const parts: OutputPart[] = [];
  let previousAtomic = false;
  for (const [index, item] of flatten(value).entries()) {
    if (itemSeparator !== undefined && index > 0) parts.push(itemSeparator);
    if (isAtomicValue(item)) {
      if (itemSeparator === undefined && previousAtomic) parts.push(' ');
      parts.push(stringValueOf(item));
      previousAtomic = true;
      continue;
    }
    previousAtomic = false;
    parts.push(...nodeParts(item));
  }
  return parts;
}

/** The parts a node or function item gives: a document's children, or the node; SENR0001 for those the methods cannot write. */
function nodeParts(item: XdmItem): readonly XdmNode[] {
  if (!isNode(item)) return notSerializable('A map or function item');
  if (item.kind === NodeKind.ATTRIBUTE) return notSerializable('An attribute node');
  if (item.kind === NodeKind.NAMESPACE) return notSerializable('A namespace node');
  return item.kind === NodeKind.DOCUMENT ? item.children() : [item];
}
