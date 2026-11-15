import { derivesFrom, isNumericType, Occurrence, XS } from '@exemplarjs/xdm';
import {
  ARRAY_SIGNATURE,
  type FunctionSignature,
  type ItemShape,
  MAP_SIGNATURE,
  ONE_ATOMIC,
  ONE_INTEGER,
  sequenceMatcher,
  type SequenceTypeMatcher,
} from './matchers.ts';

/** The occurrence indicators that allow no items. */
const ALLOWS_NONE: ReadonlySet<Occurrence> = new Set([Occurrence.ZERO_OR_ONE, Occurrence.ZERO_OR_MORE]);
/** The occurrence indicators that allow more than one item. */
const ALLOWS_MANY: ReadonlySet<Occurrence> = new Set([Occurrence.ZERO_OR_MORE, Occurrence.ONE_OR_MORE]);

/** Whether every count one occurrence indicator allows, another allows too. */
function occurrenceSubtype(from: Occurrence, to: Occurrence): boolean {
  return (!ALLOWS_NONE.has(from) || ALLOWS_NONE.has(to)) && (!ALLOWS_MANY.has(from) || ALLOWS_MANY.has(to));
}

/** Whether every value of one sequence type is a value of another (XPath §2.5.6.1). */
export function isSubtype(from: SequenceTypeMatcher, to: SequenceTypeMatcher): boolean {
  const toAllowsNone = to.itemType === undefined || ALLOWS_NONE.has(to.occurrence);
  if (from.itemType === undefined) return toAllowsNone;
  // A type of no items, such as xs:error?, holds at most the empty sequence.
  if (from.itemType.shape.kind === 'nothing') return !ALLOWS_NONE.has(from.occurrence) || toAllowsNone;
  if (to.itemType === undefined) return false;
  return occurrenceSubtype(from.occurrence, to.occurrence) && isItemSubtype(from.itemType.shape, to.itemType.shape);
}

/** Whether one function signature is a subtype of another: as many parameters, each wider, and a narrower result. */
export function isSignatureSubtype(from: FunctionSignature, to: FunctionSignature): boolean {
  const parameters = from.parameterTypes;
  return (
    parameters.length === to.parameterTypes.length &&
    to.parameterTypes.every((type, index) => isSubtype(type, parameters[index] as SequenceTypeMatcher)) &&
    isSubtype(from.returnType, to.returnType)
  );
}

/** The shape of a node test. */
type NodeShape = Extract<ItemShape, { kind: 'node' }>;

/** The shapes of function types: functions, maps and arrays. */
type FunctionShape = Extract<ItemShape, { kind: 'function' | 'map' | 'array' }>;

/** A function, map or array type as the function signature it has; undefined for `function(*)`. */
function signatureOfShape(shape: FunctionShape): FunctionSignature | undefined {
  if (shape.kind === 'map') {
    const value = shape.valueType;
    return value === undefined ? MAP_SIGNATURE : { parameterTypes: [ONE_ATOMIC], returnType: orEmpty(value) };
  }
  if (shape.kind !== 'array') return shape.signature;
  const member = shape.memberType;
  return member === undefined ? ARRAY_SIGNATURE : { parameterTypes: [ONE_INTEGER], returnType: member };
}

/** The base of each schema type an element or attribute test can name, for deriving one from another. */
const SCHEMA_BASES: Readonly<Record<string, string>> = {
  untyped: 'anyType',
  anySimpleType: 'anyType',
  anyAtomicType: 'anySimpleType',
  untypedAtomic: 'anyAtomicType',
};

/** Whether a node test's schema type is a subtype of another's: derived from it, and nillable only if it is. */
function schemaTypeSubtype(from: NodeShape, to: NodeShape): boolean {
  if (to.typeName === undefined) return true;
  if (from.typeName === undefined || (from.nillable && !to.nillable)) return false;
  for (let type: string | undefined = from.typeName; type !== undefined; type = SCHEMA_BASES[type])
    if (type === to.typeName) return true;
  return false;
}

/** Whether one node test is a subtype of another: of its kind, with its name, a derived type and the same other constraints. */
function nodeSubtype(from: ItemShape, to: NodeShape): boolean {
  if (from.kind !== 'node') return false;
  if (to.nodeKind === undefined) return true;
  return (
    from.nodeKind === to.nodeKind &&
    (to.name === undefined || from.name === to.name) &&
    (to.target === undefined || from.target === to.target) &&
    (to.element === undefined || (from.element !== undefined && isItemSubtype(from.element.shape, to.element.shape))) &&
    schemaTypeSubtype(from, to)
  );
}

/** The types that make up `xs:numeric`, a union, which is a subtype of a type every one of them derives from. */
const NUMERIC_MEMBERS = [XS.decimal, XS.float, XS.double];

/** A sequence type that also allows the empty sequence, as a map's value does for a missing key. */
function orEmpty(type: SequenceTypeMatcher): SequenceTypeMatcher {
  if (type.itemType === undefined || ALLOWS_NONE.has(type.occurrence)) return type;
  const occurrence = ALLOWS_MANY.has(type.occurrence) ? Occurrence.ZERO_OR_MORE : Occurrence.ZERO_OR_ONE;
  return sequenceMatcher(type.itemType, occurrence);
}

/** Whether every item of one item type is an item of another (XPath §2.5.6.2). */
function isItemSubtype(from: ItemShape, to: ItemShape): boolean {
  if (to.kind === 'any-item' || from.kind === 'nothing') return true;
  switch (to.kind) {
    case 'atomic': {
      if (from.kind === 'numeric') return NUMERIC_MEMBERS.every((member) => derivesFrom(member, to.type));
      return from.kind === 'atomic' && derivesFrom(from.type, to.type);
    }
    case 'numeric': {
      return from.kind === 'numeric' || (from.kind === 'atomic' && isNumericType(from.type));
    }
    case 'node': {
      return nodeSubtype(from, to);
    }
    case 'function': {
      return functionSubtype(from, to.signature);
    }
    case 'map': {
      return mapSubtype(from, to);
    }
    case 'array': {
      if (from.kind !== 'array') return false;
      return (
        to.memberType === undefined || (from.memberType !== undefined && isSubtype(from.memberType, to.memberType))
      );
    }
    default: {
      return false;
    }
  }
}

/** Whether an item type is a subtype of a function test, `function(*)` when the signature is undefined. */
function functionSubtype(from: ItemShape, signature: FunctionSignature | undefined): boolean {
  if (from.kind !== 'function' && from.kind !== 'map' && from.kind !== 'array') return false;
  if (signature === undefined) return true;
  const own = signatureOfShape(from);
  return own !== undefined && isSignatureSubtype(own, signature);
}

/** Whether one map type is a subtype of another: `map(*)` takes any, a typed one keys and values that fit. */
function mapSubtype(from: ItemShape, to: Extract<ItemShape, { kind: 'map' }>): boolean {
  if (from.kind !== 'map') return false;
  if (to.keyType === undefined || to.valueType === undefined) return true;
  if (from.keyType === undefined || from.valueType === undefined) return false;
  return isItemSubtype(from.keyType.shape, to.keyType.shape) && isSubtype(from.valueType, to.valueType);
}
