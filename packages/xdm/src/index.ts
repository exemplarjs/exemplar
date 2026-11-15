export {
  ANY_KIND,
  ANY_NAME,
  ANY_NODE,
  Axis,
  type NodeIterator,
  type NodeName,
  type NodeTest,
  axisIterator,
  nodesAfter,
} from './axes/axis.ts';
export { IllegalStateError, InvalidArgumentError } from '@exemplarjs/xml';
export { XdmDocumentBuilder } from './build/document-builder.ts';
export { XdmBuildingHandler } from './build/sax-handler.ts';
export { NO_NAME, NameTable, SEVERAL_CODES } from './names/name-table.ts';
export { XdmNode } from './node/xdm-node.ts';
export { compareOrder } from './node/order.ts';
export { XdmArray } from './structures/xdm-array.ts';
export { XdmFunction } from './structures/xdm-function.ts';
export { type DuplicateKeys, type MapEntry, XdmMap } from './structures/xdm-map.ts';
export { NodeKind, kindName } from './node-kind.ts';
export { baseURI } from './tree/base-uri.ts';
export { type NamespaceBinding, inScopeNamespaces, namespaceForPrefix } from './tree/namespaces.ts';
export { AttributeFlag, NO_NODE, Tree, type TreeParts, type UnparsedEntity } from './tree/tree.ts';
export { TreeBuilder, type TreeBuilderOptions } from './tree/tree-builder.ts';
export { type CastOptions, castAs, isCastable } from './casting/cast-table.ts';
export { DEFAULT_PREFIXES } from './casting/cast-from-string.ts';
export {
  type ComparisonOperator,
  type ComparisonOptions,
  compareAtomic,
  valueCompare,
} from './compare/value-comparison.ts';
export { type DateKind, XMLGregorianCalendar } from './date-time/calendar.ts';
export { atomicArithmetic } from './date-time/date-time-arithmetic.ts';
export type { CalendarFields } from './date-time/date-time-lexical.ts';
export { Duration } from './date-time/duration.ts';
export { XPathErrorCode, XdmError } from './errors.ts';
export { Decimal, type RoundingMode } from './numeric/decimal.ts';
export { doubleToString } from './numeric/double.ts';
export { floatToString } from './numeric/float.ts';
export { type ArithmeticOperator, numericArithmetic, numericNegate } from './numeric/numeric-arithmetic.ts';
export { type PrefixResolver, parseQName } from './text/qname-value.ts';
export {
  AtomicType,
  type Restriction,
  type Whitespace,
  XS,
  XS_NAMESPACE,
  type CalendarKind,
  type DurationKind,
  atomicType,
  derivesFrom,
  isCalendarType,
  isDurationType,
  isIntegerType,
  isNumericType,
} from './types/built-in-types.ts';
export {
  type ItemType,
  Occurrence,
  type SequenceType,
  itemTypeToString,
  sequenceType,
  sequenceTypeToString,
} from './types/sequence-type.ts';
export { itemMatches, matchesSequenceType } from './types/type-matching.ts';
export { type AtomicContent, XdmAtomicValue } from './values/atomic-value.ts';
export {
  EMPTY_SEQUENCE,
  type XdmItem,
  type XdmValue,
  isArray,
  isAtomicValue,
  isFunction,
  isMap,
  isNode,
} from './values/item.ts';
