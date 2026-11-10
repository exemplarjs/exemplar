import type { QName } from '@exemplarjs/xml';
import { NodeKind } from '@/node-kind';
import type { XdmNode } from '@/node/xdm-node';
import { isAtomicValue, isNode, type XdmItem, type XdmValue } from '@/values/item';
import { derivesFrom } from './built-in-types.ts';
import { type ItemType, Occurrence, type SequenceType } from './sequence-type.ts';

/** Whether a node has a name: by local name alone for a processing instruction, else with its namespace. */
function hasName(node: XdmNode, name: QName): boolean {
  if (node.localName !== name.localName) return false;
  return node.kind === NodeKind.PROCESSING_INSTRUCTION || node.namespaceURI === name.namespaceURI;
}

/** Whether an item is an instance of an item type. */
export function itemMatches(item: XdmItem, itemType: ItemType): boolean {
  if (itemType.kind === 'any-item') return true;
  if (itemType.kind === 'atomic') return isAtomicValue(item) && derivesFrom(item.type, itemType.type);
  if (!isNode(item)) return false;
  if (itemType.nodeKind !== undefined && item.kind !== itemType.nodeKind) return false;
  const name = itemType.name;
  if (name === undefined) return true;
  if (item.kind !== NodeKind.DOCUMENT) return hasName(item, name);
  // document-node(element(name)) asks for one element child, of that name, and no text.
  const element = soleElement(item);
  return element !== undefined && hasName(element, name);
}

/** A document's one element child, when it has exactly one and no text, as `document-node(element())` asks. */
export function soleElement(document: XdmNode): XdmNode | undefined {
  const children = document.children();
  const elements = children.filter((child) => child.kind === NodeKind.ELEMENT);
  const hasText = children.some((child) => child.kind === NodeKind.TEXT);
  return elements.length === 1 && !hasText ? elements[0] : undefined;
}

/** Whether a number of items is allowed by an occurrence indicator. */
export function countAllowed(count: number, occurrence: Occurrence): boolean {
  if (occurrence === Occurrence.ZERO_OR_MORE) return true;
  if (occurrence === Occurrence.ONE_OR_MORE) return count > 0;
  return occurrence === Occurrence.ZERO_OR_ONE ? count <= 1 : count === 1;
}

/** Whether a value is an instance of a sequence type, as `instance of` asks: the right number of items, each matching. */
export function matchesSequenceType(value: XdmValue, type: SequenceType): boolean {
  if (type.kind === 'empty') return value.length === 0;
  return countAllowed(value.length, type.occurrence) && value.every((item) => itemMatches(item, type.itemType));
}
