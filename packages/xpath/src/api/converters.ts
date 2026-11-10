import {
  type AtomicType,
  atomicType,
  castAs,
  Decimal,
  derivesFrom,
  Duration,
  isArray,
  isAtomicValue,
  isCalendarType,
  isIntegerType,
  isMap,
  XdmAtomicValue,
  type XdmItem,
  type XdmValue,
  XMLGregorianCalendar,
  XS,
} from '@exemplarjs/xdm';
import { InvalidArgumentError } from '@exemplarjs/xml';
import { ErrorFactory } from '@exemplarjs/xml/internal';
import { stringValueOf } from '@/functions/core/strings';

/** How values of one atomic type cross the boundary: to JavaScript in results, and from JavaScript in variables. */
export interface Converter {
  /** A value of the type as JavaScript. */
  toJS?(value: XdmAtomicValue): unknown;

  /** A JavaScript value as a value of the type, or undefined to leave it to the default. */
  fromJS?(value: unknown, type: AtomicType): XdmAtomicValue | undefined;
}

/** Converters by the type name they apply to, such as `xs:integer`; a value takes the converter of its nearest type. */
export type Converters = Readonly<Record<string, Converter>>;

/** The converter for a type: its own, or its nearest base type's. */
function converterFor(type: AtomicType, converters: Converters): Converter | undefined {
  for (let current: AtomicType | null = type; current !== null; current = current.base) {
    const converter = converters[current.toString()];
    if (converter !== undefined) return converter;
  }
  return undefined;
}

/** A number a value converts to; RangeError when its whole part is beyond `Number.MAX_SAFE_INTEGER`, where numbers lose integers. */
export function wholePartSafe(number: number, value: bigint | Decimal, advice: string): number {
  if (!Number.isSafeInteger(Math.trunc(number)))
    throw ErrorFactory.create(RangeError, `${value} is too large for a JavaScript number; ${advice}`);
  return number;
}

/**
 * The default JavaScript value of an atomic value: numbers, booleans and strings as themselves,
 * binary values as copies of their bytes, dates, times and durations as the immutable classes that
 * hold them, and other types as their canonical text.
 */
function defaultToJS(value: XdmAtomicValue): unknown {
  const content = value.value;
  if (typeof content === 'bigint') return wholePartSafe(Number(content), content, 'use a converter to bigint');
  if (content instanceof Decimal) return wholePartSafe(content.toNumber(), content, 'use a converter');
  if (typeof content === 'number' || typeof content === 'boolean' || typeof content === 'string') return content;
  // A copy, so that changing it changes no value.
  if (content instanceof Uint8Array) return content.slice();
  if (content instanceof XMLGregorianCalendar || content instanceof Duration) return content;
  return stringValueOf(value);
}

/** An atomic value as JavaScript, by the converters or the default. */
function atomicToJS(value: XdmAtomicValue, converters: Converters): unknown {
  const converter = converterFor(value.type, converters);
  return converter?.toJS === undefined ? defaultToJS(value) : converter.toJS(value);
}

/** A value inside a map or array as JavaScript: none as null, one item as itself, more as a list. */
function memberToJS(value: XdmValue, converters: Converters): unknown {
  if (value.length === 0) return null;
  return value.length === 1
    ? itemToJS(value[0] as XdmItem, converters)
    : value.map((item) => itemToJS(item, converters));
}

/**
 * An item as JavaScript: an atomic value by the converters, a map as a `Map` and an array as a
 * list, their keys and values converted in turn; nodes and other function items as they are.
 */
export function itemToJS(item: XdmItem, converters: Converters): unknown {
  if (isAtomicValue(item)) return atomicToJS(item, converters);
  if (isMap(item)) {
    const entries = [...item.entries()].map(([key, value]): [unknown, unknown] => [
      atomicToJS(key, converters),
      memberToJS(value, converters),
    ]);
    return new Map(entries);
  }
  return isArray(item) ? item.members.map((member) => memberToJS(member, converters)) : item;
}

/** An integer as an `xs:integer`, cast to the declared type when that is an integer type. */
function integerAs(value: number | bigint, type: AtomicType | undefined): XdmAtomicValue {
  const integer = XdmAtomicValue.integer(value);
  return type !== undefined && isIntegerType(type) ? castAs(integer, type) : integer;
}

/** A JavaScript number as a value of a numeric type: an integer type takes integers only, as `XdmAtomicValue.integer` checks. */
function numberAs(value: number, type: AtomicType | undefined): XdmAtomicValue {
  if (type !== undefined && isIntegerType(type)) return integerAs(value, type);
  if (type === XS.decimal) return XdmAtomicValue.decimal(Decimal.fromNumber(value));
  if (type === XS.float) return XdmAtomicValue.float(Math.fround(value));
  return XdmAtomicValue.double(value);
}

/** A JavaScript `Date` as a `xs:dateTime` in UTC, as a Date counts its milliseconds from the epoch in UTC; cast to a declared date or time type. */
function dateAs(date: Date, type: AtomicType | undefined): XdmAtomicValue {
  const value = XdmAtomicValue.calendar(XMLGregorianCalendar.fromDate(date));
  if (type !== undefined && isCalendarType(type)) return castAs(value, type);
  return value;
}

/** A date, time or duration object, or bytes, as the value that holds it, or undefined for any other object. */
function objectAs(value: object, type: AtomicType | undefined): XdmAtomicValue | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : dateAs(value, type);
  // A copy, so that changing the bytes given changes no value.
  if (value instanceof Uint8Array)
    return new XdmAtomicValue(type === XS.hexBinary ? XS.hexBinary : XS.base64Binary, value.slice());
  if (value instanceof XMLGregorianCalendar) return XdmAtomicValue.calendar(value);
  return value instanceof Duration ? XdmAtomicValue.duration(value) : undefined;
}

/** The default atomic value of a JavaScript value for a declared atomic type, or undefined when it has none. */
function defaultFromJS(value: unknown, type: AtomicType | undefined): XdmAtomicValue | undefined {
  switch (typeof value) {
    case 'number': {
      return numberAs(value, type);
    }
    case 'bigint': {
      return integerAs(value, type);
    }
    case 'boolean': {
      return XdmAtomicValue.boolean(value);
    }
    case 'object': {
      return value === null ? undefined : objectAs(value, type);
    }
    case 'string': {
      const text = XdmAtomicValue.string(value);
      if (type === undefined || derivesFrom(XS.string, type)) return text;
      return castAs(text, type);
    }
    default: {
      return undefined;
    }
  }
}

/** A value no declared type or default converts, as the first converter that takes it gives it, each asked with its own type. */
function anyFromJS(value: unknown, converters: Converters): XdmAtomicValue | undefined {
  for (const [name, converter] of Object.entries(converters)) {
    const type = atomicType(name.slice(name.indexOf(':') + 1));
    const converted = type === undefined ? undefined : converter.fromJS?.(value, type);
    if (converted !== undefined) return converted;
  }
  return undefined;
}

/** A JavaScript value as an atomic value for a declared type, by the converters or the default; TypeError when there is none. */
export function atomicFromJS(value: unknown, type: AtomicType | undefined, converters: Converters): XdmAtomicValue {
  const converter = type === undefined ? undefined : converterFor(type, converters);
  const converted =
    converter?.fromJS?.(value, type as AtomicType) ?? defaultFromJS(value, type) ?? anyFromJS(value, converters);
  if (converted === undefined)
    throw ErrorFactory.create(InvalidArgumentError, `${String(value)} has no XPath value; add a converter for it`);
  return converted;
}
