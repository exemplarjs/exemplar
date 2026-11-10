import { ErrorFactory } from '@exemplarjs/xml/internal';
import { XPathErrorCode, xdmError } from '@/errors';
import { Decimal } from '@/numeric/decimal';
import { type AtomicType, type CalendarKind, isCalendarType, XS } from '@/types/built-in-types';
import {
  type CalendarFields,
  formatCalendar,
  invalidValue,
  KIND_FIELDS,
  parseCalendarFields,
  timezoneFromOption,
} from './date-time-lexical.ts';
import {
  dayNumber,
  daysInMonth,
  isTimezone,
  LAST_HOUR,
  LAST_MINUTE,
  LAST_SECOND,
  MILLISECONDS_PER_SECOND,
  MINUTES_PER_HOUR,
  MONTHS_PER_YEAR,
  SECONDS_PER_DAY,
  SECONDS_PER_MINUTE,
} from './gregorian.ts';

/** The kinds with each field. */
type YearKind = 'dateTime' | 'dateTimeStamp' | 'date' | 'gYearMonth' | 'gYear';
type MonthKind = 'dateTime' | 'dateTimeStamp' | 'date' | 'gYearMonth' | 'gMonthDay' | 'gMonth';
type DayKind = 'dateTime' | 'dateTimeStamp' | 'date' | 'gMonthDay' | 'gDay';
type TimeKind = 'dateTime' | 'dateTimeStamp' | 'time';

/** The kinds that name a day on the calendar, and so have a JavaScript `Date`. */
export type DateKind = 'dateTime' | 'dateTimeStamp' | 'date';

/** A field's type for a kind: `T` when every kind in `K` has it, `undefined` when none does, else either. */
type Field<K extends CalendarKind, Having extends CalendarKind, T> = [K] extends [Having]
  ? T
  : [K] extends [Exclude<CalendarKind, Having>]
    ? undefined
    : T | undefined;

/** The milliseconds in a minute and a day, and the decimal places of a millisecond. */
const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const MILLISECONDS_PER_DAY = SECONDS_PER_DAY * MILLISECONDS_PER_SECOND;
const MILLISECOND_PLACES = 3;

/** Whether a field is a whole number from `low` to `high`. */
function inRange(value: number | undefined, low: number, high: number): boolean {
  return value !== undefined && Number.isInteger(value) && value >= low && value <= high;
}

/** Checks that fields are those the kind has, each in range, and that the day exists in its month. */
function checkFields(kind: CalendarKind, fields: CalendarFields): void {
  const has = KIND_FIELDS[kind];
  const present = (field: keyof CalendarFields): boolean => fields[field] !== undefined;
  if (present('year') !== has.year || present('month') !== has.month || present('day') !== has.day)
    invalidValue(kind, 'needs exactly its own date fields');
  const timeFields = ['hour', 'minute', 'second'] as const;
  if (timeFields.some((field) => present(field) !== has.time) || (!has.time && present('fractionalSecond')))
    invalidValue(kind, 'needs exactly its own time fields');
  if (has.year && !Number.isSafeInteger(fields.year)) invalidValue(kind, 'needs a year that is a safe integer');
  if (has.month && !inRange(fields.month, 1, MONTHS_PER_YEAR)) invalidValue(kind, 'needs a month from 1 to 12');
  if (has.day && !inRange(fields.day, 1, daysInMonth(fields.year, fields.month ?? 1)))
    invalidValue(kind, 'needs a day that exists in its month');
  if (has.time) checkTime(kind, fields);
  if (fields.timezone !== undefined && !isTimezone(fields.timezone))
    invalidValue(kind, 'needs a timezone of whole minutes within 14 hours of UTC');
  if (kind === 'dateTimeStamp' && fields.timezone === undefined) invalidValue(kind, 'needs a timezone');
}

/** Checks a time of day's fields. */
function checkTime(kind: CalendarKind, fields: CalendarFields): void {
  if (
    !inRange(fields.hour, 0, LAST_HOUR) ||
    !inRange(fields.minute, 0, LAST_MINUTE) ||
    !inRange(fields.second, 0, LAST_SECOND)
  )
    invalidValue(kind, 'needs a time from 00:00:00 to 23:59:59');
  const fraction = fields.fractionalSecond ?? Decimal.ZERO;
  if (fraction.sign() < 0 || fraction.compare(Decimal.of(1n)) >= 0)
    invalidValue(kind, 'needs a fraction of a second below 1');
}

/**
 * A value of one of XML Schema's nine date and time types, immutable: `xs:dateTime`,
 * `xs:dateTimeStamp`, `xs:date`, `xs:time`, `xs:gYearMonth`, `xs:gYear`, `xs:gMonthDay`,
 * `xs:gDay` and `xs:gMonth`. All share XML Schema's seven-property model, of which each type has
 * some fields: a date has a year, a month and a day, a time the hour, minute and seconds, and any
 * of them an optional timezone. The fields a type lacks are `undefined`, and the type parameter
 * tells TypeScript which those are.
 *
 * ```ts
 * const leapDay = XMLGregorianCalendar.parse('2024-02-29+01:00', XS.date);
 * leapDay.day;        // 29
 * leapDay.timezone;   // 60, in minutes east of UTC
 * leapDay.hour;       // undefined, and a type error: a date has no time
 * leapDay.toString(); // '2024-02-29+01:00'
 * ```
 *
 * The name and fields are those of Java's `javax.xml.datatype.XMLGregorianCalendar`, without its
 * setters: an `XdmAtomicValue` of these types holds one directly, so it never changes.
 */
export class XMLGregorianCalendar<K extends CalendarKind = CalendarKind> {
  /** The type, such as `XS.date`. */
  readonly xmlSchemaType: AtomicType<K>;
  /** The year, any safe integer; year 0 is 1 BCE, as XML Schema 1.1 counts. */
  readonly year: Field<K, YearKind, number>;
  /** The month, 1 to 12. */
  readonly month: Field<K, MonthKind, number>;
  readonly day: Field<K, DayKind, number>;
  readonly hour: Field<K, TimeKind, number>;
  readonly minute: Field<K, TimeKind, number>;
  /** The whole seconds, 0 to 59. */
  readonly second: Field<K, TimeKind, number>;
  /** The fraction of a second, exact: zero when there is none. */
  readonly fractionalSecond: Field<K, TimeKind, Decimal>;
  /** Minutes east of UTC, from -840 to 840, or undefined for a value without a timezone. */
  readonly timezone: [K] extends ['dateTimeStamp'] ? number : number | undefined;

  /** A value of a date or time type from its fields, the fraction of a second zero by default; XPTY0004 for another type, FORG0001 for fields that make none. */
  constructor(type: AtomicType<K>, fields: CalendarFields) {
    if (!isCalendarType(type)) xdmError(XPathErrorCode.TYPE_MISMATCH, `${String(type)} is not a date or time type`);
    const kind = type.name.localName as K;
    checkFields(kind, fields);
    this.xmlSchemaType = type;
    this.year = fields.year as this['year'];
    this.month = fields.month as this['month'];
    this.day = fields.day as this['day'];
    this.hour = fields.hour as this['hour'];
    this.minute = fields.minute as this['minute'];
    this.second = fields.second as this['second'];
    let fraction: Decimal | undefined;
    if (KIND_FIELDS[kind].time) fraction = fields.fractionalSecond ?? Decimal.ZERO;
    this.fractionalSecond = fraction as this['fractionalSecond'];
    this.timezone = fields.timezone as this['timezone'];
  }

  /** The value a lexical form names, such as `'2024-02-29T12:00:00Z'` as `XS.dateTime`; FORG0001 when it is not one. */
  static parse<K extends CalendarKind>(text: string, type: AtomicType<K>): XMLGregorianCalendar<K> {
    const kind = type.name.localName as K;
    const fields = parseCalendarFields(text, kind);
    if (fields === undefined) return invalidValue(kind, `cannot be read from ${JSON.stringify(text)}`);
    return new XMLGregorianCalendar(type, fields);
  }

  /** The instant a JavaScript `Date` holds, as a `xs:dateTime` in UTC, as a `Date` counts milliseconds from the epoch in UTC. */
  static fromDate(date: Date): XMLGregorianCalendar<'dateTime'> {
    const milliseconds = BigInt(date.getUTCMilliseconds());
    return new XMLGregorianCalendar(XS.dateTime, {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      fractionalSecond: Decimal.of(milliseconds, MILLISECOND_PLACES),
      timezone: 0,
    });
  }

  /** The kind of value, the type's local name, such as `date`. */
  get kind(): K {
    return this.xmlSchemaType.name.localName as K;
  }

  /** The canonical lexical form, as XPath casts the value to a string: `2024-02-29+01:00`. */
  toString(): string {
    return formatCalendar(this.kind, this);
  }

  /**
   * The instant as a JavaScript `Date`, for a date or a date and time: a date at its midnight. A
   * value without a timezone takes `zone`, minutes or an offset such as `'+01:00'`, or else the
   * machine's local time. Fractions of a millisecond are dropped; RangeError for a year a `Date`
   * cannot hold.
   */
  toDate(this: XMLGregorianCalendar<DateKind>, zone?: number | string): Date {
    const { year, month, day } = this;
    if (day === undefined) throw ErrorFactory.create(RangeError, `${this.toString()} names no day, so has no Date`);
    const hour = this.hour ?? 0;
    const minute = this.minute ?? 0;
    const millisecond =
      (this.second ?? 0) * MILLISECONDS_PER_SECOND +
      Math.trunc((this.fractionalSecond?.toNumber() ?? 0) * MILLISECONDS_PER_SECOND);
    const offset = this.timezone ?? (zone === undefined ? undefined : timezoneFromOption(zone));
    let date: Date;
    if (offset === undefined) {
      date = new Date(0);
      date.setFullYear(year, month - 1, day);
      date.setHours(hour, minute, 0, millisecond);
    } else {
      // Counted from the epoch, so an instant near the end of a Date's range is not lost to its local time.
      const sinceMidnight = (hour * MINUTES_PER_HOUR + minute - offset) * MILLISECONDS_PER_MINUTE + millisecond;
      const days = Number(dayNumber(year, month, day));
      date = new Date(days * MILLISECONDS_PER_DAY + sinceMidnight);
    }
    if (Number.isNaN(date.getTime()))
      throw ErrorFactory.create(RangeError, `${this.toString()} is beyond the range of a Date`);
    return date;
  }
}

/** A value's fields as a kind has them, for making another value: the fields the kind lacks dropped, a missing time at midnight. */
export function fieldsOf(value: XMLGregorianCalendar, kind: CalendarKind = value.kind): CalendarFields {
  const has = KIND_FIELDS[kind];
  return {
    ...(has.year && { year: value.year }),
    ...(has.month && { month: value.month }),
    ...(has.day && { day: value.day }),
    ...(has.time && {
      hour: value.hour ?? 0,
      minute: value.minute ?? 0,
      second: value.second ?? 0,
      fractionalSecond: value.fractionalSecond,
    }),
    timezone: value.timezone,
  };
}

/** The type F&O gives a value moved by a duration or adjusted to a timezone: a `xs:dateTimeStamp` becomes a `xs:dateTime`. */
export function movedType(value: XMLGregorianCalendar): AtomicType<CalendarKind> {
  return value.kind === 'dateTimeStamp' ? XS.dateTime : value.xmlSchemaType;
}
