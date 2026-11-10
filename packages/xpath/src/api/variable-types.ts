import type { Duration, XdmArray, XdmFunction, XdmItem, XdmMap, XdmNode, XMLGregorianCalendar } from '@exemplarjs/xdm';
import type { EvaluationOptions } from './evaluation-options.ts';

/** The variables an expression declares: names alone, taking any value, or names with their sequence types. */
export type VariableDeclarations = readonly string[] | Readonly<Record<string, string>>;

/** The names of the numeric types, built-in and derived from `xs:integer`. */
type NumericTypeName =
  | `xs:${'numeric' | 'decimal' | 'double' | 'float' | 'integer' | 'long' | 'int' | 'short' | 'byte'}`
  | `xs:${'nonNegativeInteger' | 'positiveInteger' | 'nonPositiveInteger' | 'negativeInteger'}`
  | `xs:unsigned${string}`;

/** The names of the string types, `xs:anyURI` and `xs:untypedAtomic`. */
type StringTypeName = `xs:${
  | 'string'
  | 'normalizedString'
  | 'token'
  | 'language'
  | 'NMTOKEN'
  | 'Name'
  | 'NCName'
  | 'ID'
  | 'IDREF'
  | 'ENTITY'
  | 'anyURI'
  | 'untypedAtomic'}`;

/** The names of the date and time types. */
type CalendarTypeName =
  `xs:${'dateTime' | 'dateTimeStamp' | 'date' | 'time' | 'gYearMonth' | 'gYear' | 'gMonthDay' | 'gDay' | 'gMonth'}`;

/** The names of the duration types. */
type DurationTypeName = `xs:${'duration' | 'yearMonthDuration' | 'dayTimeDuration'}`;

/** The node tests, such as `element()` or `attribute(id)`. */
type NodeTest =
  `${'node' | 'element' | 'attribute' | 'document-node' | 'text' | 'comment' | 'processing-instruction' | 'namespace-node'}(${string})`;

/** The JavaScript values an item of each type takes, by the type's name. */
type ItemValues = Record<NumericTypeName, number | bigint | XdmItem> &
  Record<'xs:boolean', boolean | XdmItem> &
  Record<StringTypeName, string | XdmItem> &
  Record<CalendarTypeName, Date | XMLGregorianCalendar | string | XdmItem> &
  Record<DurationTypeName, Duration | string | XdmItem> &
  Record<'xs:base64Binary' | 'xs:hexBinary', Uint8Array | string | XdmItem> &
  Record<NodeTest, XdmNode> &
  Record<`map(${string})`, ReadonlyMap<unknown, unknown> | Readonly<Record<string, unknown>> | XdmMap> &
  Record<`array(${string})`, XdmArray> &
  Record<`function(${string}`, XdmFunction>;

/** The JavaScript value of one item of a type, by the type's name, an atomic type taking `Custom` too; anything for a type not listed. */
type ItemJsValue<Type extends string, Custom> = Type extends keyof ItemValues
  ? ItemValues[Type] | (Type extends `xs:${string}` ? Custom : never)
  : unknown;

/** A sequence type's item type: the type without its occurrence indicator. */
type ItemType<Type extends string> = Type extends `${infer Item}${'?' | '*' | '+'}` ? Item : Type;

/** The JavaScript values of the sequence types whose items take `Item`, by their occurrence indicators. */
type SequenceValues<Item> = Record<'empty-sequence()', readonly [] | null | undefined> &
  Record<`${string}?`, Item | null | undefined> &
  Record<`${string}*`, readonly Item[] | Item | null | undefined> &
  Record<`${string}+`, readonly Item[] | Item>;

/**
 * The JavaScript value a sequence type takes: one item, an optional one, or a list, by its occurrence
 * indicator. `Custom` is what the compiler's converters turn into atomic values besides.
 */
export type JsValueOf<Type extends string, Custom = never> = Type extends keyof SequenceValues<unknown>
  ? SequenceValues<ItemJsValue<ItemType<Type>, Custom>>[Type]
  : ItemJsValue<Type, Custom>;

/** The values a call must give for declared variables: any value for names alone, else a value of each variable's type. */
export type VariableValues<
  Declared extends VariableDeclarations,
  Custom = never,
> = Declared extends readonly (infer Name extends string)[]
  ? { readonly [Key in Name]: unknown }
  : { readonly [Key in keyof Declared]: JsValueOf<Declared[Key] & string, Custom> };

/**
 * The argument after the context item of `evaluate`, `select` and the conveniences: the evaluation's
 * options, whose `variables` are required when some are declared.
 */
export type EvaluationArguments<Values> = keyof Values extends never
  ? [options?: EvaluationOptions & { readonly variables?: Record<string, never> }]
  : [options: EvaluationOptions & { readonly variables: Values }];
