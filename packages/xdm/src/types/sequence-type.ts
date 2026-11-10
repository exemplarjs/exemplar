import type { QName } from '@exemplarjs/xml';
import { NodeKind } from '@/node-kind';
import type { AtomicType } from './built-in-types.ts';

/** How many items a sequence type allows: exactly one, or as `?`, `*` and `+` say. */
export const Occurrence = { EXACTLY_ONE: '', ZERO_OR_ONE: '?', ZERO_OR_MORE: '*', ONE_OR_MORE: '+' } as const;

export type Occurrence = (typeof Occurrence)[keyof typeof Occurrence];

/** What each item of a sequence must be: any item, an atomic value of a type, or a node, of a kind and name when given. */
export type ItemType =
  | { readonly kind: 'any-item' }
  | { readonly kind: 'atomic'; readonly type: AtomicType }
  | {
      readonly kind: 'node';
      /** The node kind, or undefined for `node()`. */
      readonly nodeKind?: NodeKind;
      /** The name an element, attribute or processing instruction must have, or a document its document element; undefined for any. */
      readonly name?: QName;
    };

/** A sequence type: `empty-sequence()`, or an item type with an occurrence indicator. */
export type SequenceType =
  | { readonly kind: 'empty' }
  | { readonly kind: 'items'; readonly itemType: ItemType; readonly occurrence: Occurrence };

/** The sequence type of an item type and occurrence, for building types in code. */
export function sequenceType(itemType: ItemType, occurrence: Occurrence = Occurrence.EXACTLY_ONE): SequenceType {
  return { kind: 'items', itemType, occurrence };
}

/** The name of each node kind's test in XPath. */
const KIND_TESTS: Readonly<Record<NodeKind, string>> = {
  [NodeKind.ELEMENT]: 'element',
  [NodeKind.ATTRIBUTE]: 'attribute',
  [NodeKind.TEXT]: 'text',
  [NodeKind.PROCESSING_INSTRUCTION]: 'processing-instruction',
  [NodeKind.COMMENT]: 'comment',
  [NodeKind.DOCUMENT]: 'document-node',
  [NodeKind.NAMESPACE]: 'namespace-node',
};

/** An item type as XPath writes it: `item()`, `xs:integer`, `node()`, `element(title)`, `document-node(element(r))`. */
export function itemTypeToString(itemType: ItemType): string {
  if (itemType.kind === 'any-item') return 'item()';
  if (itemType.kind === 'atomic') return itemType.type.toString();
  if (itemType.nodeKind === undefined) return 'node()';
  const name = itemType.name?.toString() ?? '';
  // A document test names its document element.
  const namesElement = itemType.nodeKind === NodeKind.DOCUMENT && name !== '';
  const argument = namesElement ? `element(${name})` : name;
  return `${KIND_TESTS[itemType.nodeKind]}(${argument})`;
}

/** A sequence type as XPath writes it: `empty-sequence()`, `xs:integer?`, `element()*`. */
export function sequenceTypeToString(type: SequenceType): string {
  return type.kind === 'empty' ? 'empty-sequence()' : `${itemTypeToString(type.itemType)}${type.occurrence}`;
}
