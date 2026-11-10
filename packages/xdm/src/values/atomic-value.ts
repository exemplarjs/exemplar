import type { QName } from '@exemplarjs/xml';
import { canonicalString } from '@/casting/cast-to-string';
import type { XMLGregorianCalendar } from '@/date-time/calendar';
import type { Duration } from '@/date-time/duration';
import { XPathErrorCode, xdmError } from '@/errors';
import type { Decimal } from '@/numeric/decimal';
import { type AtomicType, isIntegerType, XS } from '@/types/built-in-types';
import { checkContent } from './value-checks.ts';

/**
 * What an atomic value holds, by its primitive type: a string for the string types, `xs:anyURI`
 * and `xs:untypedAtomic`; a boolean; a bigint for the integers; a Decimal for other decimals; a
 * number for doubles and floats; a QName; bytes for the binary types; an XMLGregorianCalendar for
 * the date and time types; or a Duration for the durations.
 */
export type AtomicContent =
  | string
  | boolean
  | bigint
  | Decimal
  | number
  | QName
  | Uint8Array
  | XMLGregorianCalendar
  | Duration;

/** Whether the constructor checks what it is given; off only inside `uncheckedAtomicValue`. */
let checking = true;

/** How many small `xs:integer` values, from 0, are shared once made. */
const SHARED_INTEGERS = 1024;

/** The shared small integers, by value, made as first asked for. */
const SMALL_INTEGERS: XdmAtomicValue[] = [];

/**
 * An atomic value: a value of a built-in XML Schema type, such as `xs:integer` 5 or
 * `xs:string` "five". One class serves every type, so code that handles values stays monomorphic.
 *
 * ```ts
 * const five = XdmAtomicValue.integer(5n);
 * five.type === XS.integer; // true
 * five.stringValue; // '5'
 * ```
 *
 * Integers are bigints of any size, and decimals are exact, so no value is rounded on the way in;
 * converting to JavaScript values is the caller's choice. The constructor and factories check what
 * they are given: the kind of content, an integer type's range, and a string type's rules.
 */
export class XdmAtomicValue {
  readonly type: AtomicType;
  readonly value: AtomicContent;

  /** A value of a type, checked: XPTY0004 for content of the wrong kind or an abstract type, FORG0001 for a value outside the type. */
  constructor(type: AtomicType, value: AtomicContent) {
    if (checking) checkContent(type, value);
    this.type = type;
    this.value = value;
  }

  /** An `xs:string`, or a value of a type derived from it, already in the form its whitespace handling gives. */
  static string(text: string, type: AtomicType<'string'> = XS.string): XdmAtomicValue {
    return new XdmAtomicValue(type, text);
  }

  /** An `xs:untypedAtomic`, as text in an untyped document atomizes to. */
  static untypedAtomic(text: string): XdmAtomicValue {
    return new XdmAtomicValue(XS.untypedAtomic, text);
  }

  static boolean(value: boolean): XdmAtomicValue {
    return value ? TRUE : FALSE;
  }

  /** An `xs:integer`, or a value of a type derived from it; a number must be an integer. */
  static integer(value: bigint | number, type: AtomicType<'integer'> = XS.integer): XdmAtomicValue {
    if (typeof value === 'number' && !Number.isInteger(value)) {
      return xdmError(XPathErrorCode.TYPE_MISMATCH, `${value} is not an integer`);
    }
    // Counts and positions are mostly small: those values are made once and shared.
    if (typeof value === 'number' && type === XS.integer && value >= 0 && value < SHARED_INTEGERS) {
      const shared = SMALL_INTEGERS[value] ?? new XdmAtomicValue(type, BigInt(value));
      SMALL_INTEGERS[value] = shared;
      return shared;
    }
    return new XdmAtomicValue(type, typeof value === 'bigint' ? value : BigInt(value));
  }

  static decimal(value: Decimal): XdmAtomicValue {
    return new XdmAtomicValue(XS.decimal, value);
  }

  static double(value: number): XdmAtomicValue {
    return new XdmAtomicValue(XS.double, value);
  }

  /** An `xs:float`, rounded to single precision. */
  static float(value: number): XdmAtomicValue {
    return new XdmAtomicValue(XS.float, Math.fround(value));
  }

  /** A value of a date or time type, of the calendar's own type. */
  static calendar(value: XMLGregorianCalendar): XdmAtomicValue {
    return new XdmAtomicValue(value.xmlSchemaType, value);
  }

  /** A value of a duration type, of the duration's own type. */
  static duration(value: Duration): XdmAtomicValue {
    return new XdmAtomicValue(value.xmlSchemaType, value);
  }

  /** The value as XPath casts it to `xs:string`: `5`, `1.0E6`, `true`. */
  get stringValue(): string {
    return canonicalString(this);
  }

  /** Whether the value's type is `xs:integer` or derives from it. */
  get isInteger(): boolean {
    return isIntegerType(this.type);
  }

  /** The value as written, for debugging: `xs:integer("5")`. */
  toString(): string {
    return `${this.type.toString()}(${JSON.stringify(this.stringValue)})`;
  }
}

/**
 * A value made without the checks, for exemplar's own code where the content is valid by
 * construction, such as the sum of two integers; others use the constructor or the factories.
 */
export function uncheckedAtomicValue(type: AtomicType, value: AtomicContent): XdmAtomicValue {
  checking = false;
  // The constructor only assigns fields while checks are off, so it cannot throw and leave them off.
  const made = new XdmAtomicValue(type, value);
  checking = true;
  return made;
}

/** The two booleans, shared. */
const TRUE = new XdmAtomicValue(XS.boolean, true);
const FALSE = new XdmAtomicValue(XS.boolean, false);
