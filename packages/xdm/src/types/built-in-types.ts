import { QName } from '@exemplarjs/xml';
import { isNcName, isNmtoken, isXmlName } from '@exemplarjs/xml/internal';

/** The XML Schema namespace, which holds the built-in types. */
export const XS_NAMESPACE = 'http://www.w3.org/2001/XMLSchema';

/** How a type treats whitespace in text before reading it (XML Schema's `whiteSpace` facet); every type but the strings collapses it. */
export type Whitespace = 'preserve' | 'replace' | 'collapse';

/** What a derived type adds to its base type: a range for integers, whitespace handling and a check for strings. */
export interface Restriction {
  readonly minimum?: bigint;
  readonly maximum?: bigint;
  readonly whitespace?: Whitespace;
  /** Whether text, after whitespace handling, is a value of the type. */
  readonly accepts?: (text: string) => boolean;
}

/**
 * What kind of value a type holds, for the TypeScript types of the factories: `integer` for
 * `xs:integer` and the types below it, `string` for `xs:string` and those below it, each date,
 * time and duration type its own local name, and otherwise the primitive type's local name.
 */
export type ValueKind =
  | 'anyAtomicType'
  | 'string'
  | 'untypedAtomic'
  | 'anyURI'
  | 'boolean'
  | 'decimal'
  | 'integer'
  | 'double'
  | 'float'
  | 'QName'
  | 'NOTATION'
  | 'hexBinary'
  | 'base64Binary'
  | CalendarKind
  | DurationKind;

/** The kinds of the date and time types, which `XMLGregorianCalendar` holds, by the type's local name. */
export type CalendarKind =
  | 'dateTime'
  | 'dateTimeStamp'
  | 'date'
  | 'time'
  | 'gYearMonth'
  | 'gYear'
  | 'gMonthDay'
  | 'gDay'
  | 'gMonth';

/** The kinds of the duration types, which `Duration` holds, by the type's local name. */
export type DurationKind = 'duration' | 'yearMonthDuration' | 'dayTimeDuration';

/**
 * A built-in atomic type of XML Schema, such as `xs:integer`, in the hierarchy XDM uses: each
 * type has a base type it restricts, up to its primitive type, such as `xs:decimal` for
 * `xs:integer`, and up to `xs:anyAtomicType` above them all.
 *
 * ```ts
 * XS.int.primitive === XS.decimal; // true
 * derivesFrom(XS.byte, XS.integer); // true
 * ```
 */
export class AtomicType<K extends ValueKind = ValueKind> {
  /** The kind of value the type holds, known to TypeScript only. */
  declare readonly valueKind?: K;
  readonly name: QName;
  /** The type it restricts; null for `xs:anyAtomicType`. */
  readonly base: AtomicType | null;
  /** The primitive type it derives from, or itself for primitives, `xs:untypedAtomic` and `xs:anyAtomicType`. */
  readonly primitive: AtomicType;
  /** Whether no value can have the type as its own, as for `xs:anyAtomicType` and `xs:NOTATION`. */
  readonly abstract: boolean;
  readonly restriction: Restriction;
  /** Whether it is `xs:integer` or derives from it, set once so that arithmetic and comparison need not walk its bases. */
  readonly isInteger: boolean;

  constructor(localName: string, base: AtomicType | null, restriction: Restriction = {}, abstract = false) {
    this.name = new QName(XS_NAMESPACE, localName, 'xs');
    this.base = base;
    this.primitive = base?.base ? base.primitive : this;
    this.isInteger = localName === 'integer' || base?.isInteger === true;
    this.abstract = abstract;
    this.restriction = restriction;
  }

  /** The name as `xs:local`. */
  toString(): string {
    return this.name.toString();
  }
}

/** Whether a type is another or derives from it. */
export function derivesFrom(type: AtomicType, ancestor: AtomicType): boolean {
  for (let current: AtomicType | null = type; current !== null; current = current.base) {
    if (current === ancestor) return true;
  }
  return false;
}

/** The pattern of `xs:language` (XML Schema Part 2, §3.3.3). */
const LANGUAGE = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;

/** The range of a two's-complement integer of some bits. */
function signed(bits: bigint): Restriction {
  return { minimum: -(2n ** (bits - 1n)), maximum: 2n ** (bits - 1n) - 1n };
}

/** The range above the minimum of zero that an unsigned integer of some bits adds. */
function unsigned(bits: bigint): Restriction {
  return { maximum: 2n ** bits - 1n };
}

const anyAtomicType = new AtomicType<'anyAtomicType'>('anyAtomicType', null, {}, true);
const string = new AtomicType<'string'>('string', anyAtomicType);
const normalizedString = new AtomicType<'string'>('normalizedString', string, { whitespace: 'replace' });
const token = new AtomicType<'string'>('token', normalizedString, { whitespace: 'collapse' });
const name = new AtomicType<'string'>('Name', token, { accepts: isXmlName });
const ncName = new AtomicType<'string'>('NCName', name, { accepts: isNcName });
const decimal = new AtomicType<'decimal'>('decimal', anyAtomicType);
const integer = new AtomicType<'integer'>('integer', decimal);
const nonPositiveInteger = new AtomicType<'integer'>('nonPositiveInteger', integer, { maximum: 0n });
const nonNegativeInteger = new AtomicType<'integer'>('nonNegativeInteger', integer, { minimum: 0n });
const long = new AtomicType<'integer'>('long', integer, signed(64n));
const int = new AtomicType<'integer'>('int', long, signed(32n));
const short = new AtomicType<'integer'>('short', int, signed(16n));
const unsignedLong = new AtomicType<'integer'>('unsignedLong', nonNegativeInteger, unsigned(64n));
const unsignedInt = new AtomicType<'integer'>('unsignedInt', unsignedLong, unsigned(32n));
const unsignedShort = new AtomicType<'integer'>('unsignedShort', unsignedInt, unsigned(16n));
const dateTime = new AtomicType<'dateTime'>('dateTime', anyAtomicType);
const duration = new AtomicType<'duration'>('duration', anyAtomicType);

/** The built-in atomic types, by local name, as XPath writes them after `xs:`. */
export const XS = {
  anyAtomicType,
  untypedAtomic: new AtomicType<'untypedAtomic'>('untypedAtomic', anyAtomicType),
  string,
  normalizedString,
  token,
  language: new AtomicType<'string'>('language', token, { accepts: (text) => LANGUAGE.test(text) }),
  NMTOKEN: new AtomicType<'string'>('NMTOKEN', token, { accepts: isNmtoken }),
  Name: name,
  NCName: ncName,
  ID: new AtomicType<'string'>('ID', ncName),
  IDREF: new AtomicType<'string'>('IDREF', ncName),
  ENTITY: new AtomicType<'string'>('ENTITY', ncName),
  anyURI: new AtomicType<'anyURI'>('anyURI', anyAtomicType),
  boolean: new AtomicType<'boolean'>('boolean', anyAtomicType),
  decimal,
  integer,
  nonPositiveInteger,
  negativeInteger: new AtomicType<'integer'>('negativeInteger', nonPositiveInteger, { maximum: -1n }),
  long,
  int,
  short,
  byte: new AtomicType<'integer'>('byte', short, signed(8n)),
  nonNegativeInteger,
  unsignedLong,
  unsignedInt,
  unsignedShort,
  unsignedByte: new AtomicType<'integer'>('unsignedByte', unsignedShort, unsigned(8n)),
  positiveInteger: new AtomicType<'integer'>('positiveInteger', nonNegativeInteger, { minimum: 1n }),
  double: new AtomicType<'double'>('double', anyAtomicType),
  float: new AtomicType<'float'>('float', anyAtomicType),
  QName: new AtomicType<'QName'>('QName', anyAtomicType),
  NOTATION: new AtomicType<'NOTATION'>('NOTATION', anyAtomicType, {}, true),
  hexBinary: new AtomicType<'hexBinary'>('hexBinary', anyAtomicType),
  base64Binary: new AtomicType<'base64Binary'>('base64Binary', anyAtomicType),
  dateTime,
  dateTimeStamp: new AtomicType<'dateTimeStamp'>('dateTimeStamp', dateTime),
  date: new AtomicType<'date'>('date', anyAtomicType),
  time: new AtomicType<'time'>('time', anyAtomicType),
  gYearMonth: new AtomicType<'gYearMonth'>('gYearMonth', anyAtomicType),
  gYear: new AtomicType<'gYear'>('gYear', anyAtomicType),
  gMonthDay: new AtomicType<'gMonthDay'>('gMonthDay', anyAtomicType),
  gDay: new AtomicType<'gDay'>('gDay', anyAtomicType),
  gMonth: new AtomicType<'gMonth'>('gMonth', anyAtomicType),
  duration,
  yearMonthDuration: new AtomicType<'yearMonthDuration'>('yearMonthDuration', duration),
  dayTimeDuration: new AtomicType<'dayTimeDuration'>('dayTimeDuration', duration),
} as const;

/** The built-in atomic types by local name. */
const BY_LOCAL_NAME: ReadonlyMap<string, AtomicType> = new Map(
  Object.values(XS).map((type) => [type.name.localName, type])
);

/** The built-in atomic type with a local name in the XML Schema namespace, or undefined. */
export function atomicType(localName: string): AtomicType | undefined {
  return BY_LOCAL_NAME.get(localName);
}

/** Whether a type is `xs:integer` or derives from it. */
export function isIntegerType(type: AtomicType): boolean {
  return type.isInteger;
}

/** The primitive date and time types, whose values `XMLGregorianCalendar` holds. */
const CALENDAR_PRIMITIVES: ReadonlySet<AtomicType> = new Set([
  XS.dateTime,
  XS.date,
  XS.time,
  XS.gYearMonth,
  XS.gYear,
  XS.gMonthDay,
  XS.gDay,
  XS.gMonth,
]);

/** Whether a type is a date or time type: `xs:dateTime`, `xs:dateTimeStamp`, `xs:date`, `xs:time` or a `xs:g*` type. */
export function isCalendarType(type: AtomicType): type is AtomicType<CalendarKind> {
  return CALENDAR_PRIMITIVES.has(type.primitive);
}

/** Whether a type is `xs:duration` or one of the two types derived from it. */
export function isDurationType(type: AtomicType): type is AtomicType<DurationKind> {
  return type.primitive === XS.duration;
}

/** Whether a type is numeric: `xs:decimal` and the integers below it, `xs:double` or `xs:float`. */
export function isNumericType(type: AtomicType): boolean {
  const primitive = type.primitive;
  return primitive === decimal || primitive === XS.double || primitive === XS.float;
}
