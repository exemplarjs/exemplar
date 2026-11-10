import {
  type AtomicType,
  derivesFrom,
  isArray,
  isAtomicValue,
  isMap,
  type NodeKind,
  Occurrence,
  type XdmFunction,
  type XdmItem,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { countAllowed } from '@exemplarjs/xdm/internal';

/** A function's types: those of its parameters, in order, and of its result. */
export interface FunctionSignature {
  readonly parameterTypes: readonly SequenceTypeMatcher[];
  readonly returnType: SequenceTypeMatcher;
}

/**
 * What an item type allows, as a structure that subtyping can compare: any item, an atomic or
 * numeric type, nothing, a node test, or a function, map or array test with its parts when typed.
 */
export type ItemShape =
  | { readonly kind: 'any-item' | 'numeric' }
  /** No item: of `xs:error`, a union of no types, to which values are still atomized, or of a test no node can pass. */
  | { readonly kind: 'nothing'; readonly atomic: boolean }
  | { readonly kind: 'atomic'; readonly type: AtomicType }
  | {
      readonly kind: 'node';
      /** The node kind, undefined for `node()`. */
      readonly nodeKind: NodeKind | undefined;
      /** The name an element or attribute must have, as an expanded key, or undefined for any. */
      readonly name: string | undefined;
      /** The schema type an element or attribute test names, such as `anyType`, or undefined for other kinds. */
      readonly typeName: string | undefined;
      /** Whether an element test allows nilled elements, as `element(a, xs:anyType?)` does. */
      readonly nillable: boolean;
      /** The target a processing instruction must have, or undefined for any. */
      readonly target: string | undefined;
      /** The test a document's element must pass, or undefined for any document. */
      readonly element: ItemMatcher | undefined;
    }
  | { readonly kind: 'function'; readonly signature: FunctionSignature | undefined }
  | {
      readonly kind: 'map';
      readonly keyType: ItemMatcher | undefined;
      readonly valueType: SequenceTypeMatcher | undefined;
    }
  | { readonly kind: 'array'; readonly memberType: SequenceTypeMatcher | undefined };

/** An item type, compiled to a test of items. */
export interface ItemMatcher {
  /** The type as XPath writes it, for messages. */
  readonly text: string;
  readonly shape: ItemShape;

  matches(item: XdmItem): boolean;
}

/** A sequence type, compiled to a test of values. */
export interface SequenceTypeMatcher {
  readonly text: string;
  /** The item type; undefined for `empty-sequence()`. */
  readonly itemType: ItemMatcher | undefined;
  readonly occurrence: Occurrence;

  matches(value: XdmValue): boolean;
}

/** What an item matcher tests, before its text is added. */
export type ItemTest = Omit<ItemMatcher, 'text'>;

/** `empty-sequence()`. */
export const EMPTY_SEQUENCE_TYPE: SequenceTypeMatcher = {
  text: 'empty-sequence()',
  itemType: undefined,
  occurrence: Occurrence.ZERO_OR_ONE,
  matches: (value) => value.length === 0,
};

/** A sequence type of an item type and an occurrence indicator, written `text`. */
export function sequenceMatcher(
  itemType: ItemMatcher,
  occurrence: Occurrence,
  text = `${itemType.text}${occurrence}`
): SequenceTypeMatcher {
  // Any item matches `item()`, so only the count needs testing.
  const anyItem = itemType.shape.kind === 'any-item';
  return {
    text,
    itemType,
    occurrence,
    matches: anyItem
      ? (value) => countAllowed(value.length, occurrence)
      : (value) => countAllowed(value.length, occurrence) && value.every((item) => itemType.matches(item)),
  };
}

/** `item()`. */
export const ANY_ITEM: ItemMatcher = { text: 'item()', shape: { kind: 'any-item' }, matches: () => true };

/** `item()*`, any value. */
export const ANY_SEQUENCE: SequenceTypeMatcher = sequenceMatcher(ANY_ITEM, Occurrence.ZERO_OR_MORE);

/** A test that no item passes, for types no value of this processor can have; and `xs:error`'s, to which values are atomized first. */
export const NO_ITEM: ItemTest = { shape: { kind: 'nothing', atomic: false }, matches: () => false };
export const ERROR_ITEM: ItemTest = { shape: { kind: 'nothing', atomic: true }, matches: () => false };

/** `none`, the result type of a function that never returns, such as `fn:error`: a subtype of every type. */
export const NONE: SequenceTypeMatcher = sequenceMatcher({ text: 'none', ...NO_ITEM }, Occurrence.EXACTLY_ONE, 'none');

/** An atomic type as an item type. */
export function atomicItemType(type: AtomicType): ItemMatcher {
  return {
    text: type.toString(),
    shape: { kind: 'atomic', type },
    matches: (item) => isAtomicValue(item) && derivesFrom(item.type, type),
  };
}

/** Whether values given for an item type are atomized: for an atomic type, `xs:numeric` or `xs:error`. */
export function isAtomized(shape: ItemShape): boolean {
  return shape.kind === 'atomic' || shape.kind === 'numeric' || (shape.kind === 'nothing' && shape.atomic);
}

/** The atomic type of an item type, or undefined when it is not one. */
export function atomicTypeOf(itemType: ItemMatcher | undefined): AtomicType | undefined {
  return itemType?.shape.kind === 'atomic' ? itemType.shape.type : undefined;
}

/** One atomic value of any type, and one integer: the parameters of a map and of an array as functions. */
export const ONE_ATOMIC: SequenceTypeMatcher = sequenceMatcher(
  atomicItemType(XS.anyAtomicType),
  Occurrence.EXACTLY_ONE
);
export const ONE_INTEGER: SequenceTypeMatcher = sequenceMatcher(atomicItemType(XS.integer), Occurrence.EXACTLY_ONE);

/** A map's signature as a function, `function(xs:anyAtomicType) as item()*`, and an array's, `function(xs:integer) as item()*`. */
export const MAP_SIGNATURE: FunctionSignature = { parameterTypes: [ONE_ATOMIC], returnType: ANY_SEQUENCE };
export const ARRAY_SIGNATURE: FunctionSignature = { parameterTypes: [ONE_INTEGER], returnType: ANY_SEQUENCE };

/** A function item whose signature it holds itself, as every function item but maps and arrays does. */
export interface SignedFunction extends XdmFunction {
  readonly signature: FunctionSignature;
}

/** A function item's signature: a map's and an array's as XPath gives them, any other its own. */
export function signatureOf(item: XdmFunction): FunctionSignature {
  if (isMap(item)) return MAP_SIGNATURE;
  if (isArray(item)) return ARRAY_SIGNATURE;
  return (item as SignedFunction).signature;
}
