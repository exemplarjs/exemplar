import {
  type ComparisonOptions,
  isArray,
  isAtomicValue,
  isMap,
  isNode,
  NodeKind,
  type XdmArray,
  type XdmAtomicValue,
  type XdmItem,
  type XdmMap,
  type XdmNode,
  type XdmValue,
} from '@exemplarjs/xdm';
import { byCodePoint } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { atomicEqual } from './atomic-equality.ts';

/** Whether two nodes have the same name, by namespace and local name. */
function sameName(first: XdmNode, second: XdmNode): boolean {
  return first.localName === second.localName && first.namespaceURI === second.namespaceURI;
}

/** Whether two nodes' string values are equal by the options' collation. */
function sameText(first: XdmNode, second: XdmNode, options: ComparisonOptions): boolean {
  return (options.compareStrings ?? byCodePoint)(first.stringValue, second.stringValue) === 0;
}

/** A node's children that `deep-equal` compares: all but comments and processing instructions. */
function comparedChildren(node: XdmNode): XdmNode[] {
  return node
    .children()
    .filter((child) => child.kind !== NodeKind.COMMENT && child.kind !== NodeKind.PROCESSING_INSTRUCTION);
}

/** Whether two lists of nodes are deep-equal pairwise. */
function nodesEqual(first: readonly XdmNode[], second: readonly XdmNode[], options: ComparisonOptions): boolean {
  return (
    first.length === second.length && first.every((node, index) => nodeEqual(node, second[index] as XdmNode, options))
  );
}

/** Whether every attribute of one element has an equal attribute on the other, and they have as many. */
function attributesEqual(first: XdmNode, second: XdmNode, options: ComparisonOptions): boolean {
  const others = second.attributes();
  const attributes = first.attributes();
  return (
    attributes.length === others.length &&
    attributes.every((attribute) =>
      others.some((other) => sameName(attribute, other) && sameText(attribute, other, options))
    )
  );
}

/** Whether two nodes are deep-equal (F&O §14.2.1), their text compared by the options' collation. */
function nodeEqual(first: XdmNode, second: XdmNode, options: ComparisonOptions): boolean {
  if (first.kind !== second.kind) return false;
  switch (first.kind) {
    case NodeKind.DOCUMENT: {
      return nodesEqual(comparedChildren(first), comparedChildren(second), options);
    }
    case NodeKind.ELEMENT: {
      return (
        sameName(first, second) &&
        attributesEqual(first, second, options) &&
        nodesEqual(comparedChildren(first), comparedChildren(second), options)
      );
    }
    case NodeKind.TEXT:
    case NodeKind.COMMENT: {
      return sameText(first, second, options);
    }
    default: {
      return sameName(first, second) && sameText(first, second, options);
    }
  }
}

/** Whether two maps are deep-equal: the same keys, each with deep-equal values. */
function mapEqual(first: XdmMap, second: XdmMap, options: ComparisonOptions): boolean {
  if (first.size !== second.size) return false;
  for (const [key, value] of first.entries()) {
    const other = second.get(key);
    if (other === undefined || !deepEqual(value, other, options)) return false;
  }
  return true;
}

/** Whether two arrays are deep-equal: as many members, each deep-equal to the other's. */
function arrayEqual(first: XdmArray, second: XdmArray, options: ComparisonOptions): boolean {
  const members = second.members;
  return (
    first.size === second.size &&
    first.members.every((member, index) => deepEqual(member, members[index] as XdmValue, options))
  );
}

/**
 * Whether two items are deep-equal: atomic values by `eq`, NaN equal to itself; nodes by their
 * content; maps and arrays by their entries and members.
 */
function itemEqual(first: XdmItem, second: XdmItem, options: ComparisonOptions): boolean {
  const isAtomic = isAtomicValue(first);
  if (isAtomic !== isAtomicValue(second)) return false;
  if (isAtomic) return atomicEqual(first, second as XdmAtomicValue, options);
  if (isNode(first) || isNode(second)) return isNode(first) && isNode(second) && nodeEqual(first, second, options);
  if (isMap(first) && isMap(second)) return mapEqual(first, second, options);
  return isArray(first) && isArray(second) && arrayEqual(first, second, options);
}

/** Whether an item is a function item that is not a map or an array, which `deep-equal` cannot compare. */
function isPlainFunction(item: XdmItem): boolean {
  return !isAtomicValue(item) && !isNode(item) && !isMap(item) && !isArray(item);
}

/**
 * Whether two sequences are deep-equal: as long as each other, item by item, values compared with
 * the options; FOTY0015 when either holds a function item that is not a map or an array.
 */
export function deepEqual(first: XdmValue, second: XdmValue, options: ComparisonOptions): boolean {
  if (first.some((item) => isPlainFunction(item)) || second.some((item) => isPlainFunction(item)))
    return dynamicError(XPathErrorCode.FUNCTION_NOT_COMPARABLE, 'deep-equal cannot compare function items');
  return (
    first.length === second.length && first.every((item, index) => itemEqual(item, second[index] as XdmItem, options))
  );
}
