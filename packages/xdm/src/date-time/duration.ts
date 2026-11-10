import { XPathErrorCode, xdmError } from '@/errors';
import { absoluteDecimal, type Decimal } from '@/numeric/decimal';
import { type AtomicType, type DurationKind, isDurationType } from '@/types/built-in-types';
import { invalidValue, parseDurationParts } from './date-time-lexical.ts';
import { MINUTE_IN_SECONDS, MONTHS_PER_YEAR, safeCount, SECONDS_PER_DAY, splitSeconds } from './gregorian.ts';

/** One part of a duration's canonical form, such as `3D`; empty when the part is zero. */
function part(value: number | bigint, designator: string): string {
  if (value === 0 || value === 0n) return '';
  return `${value}${designator}`;
}

/**
 * A value of `xs:duration`, `xs:yearMonthDuration` or `xs:dayTimeDuration`, immutable. XML
 * Schema counts a duration in two parts that never mix, as a month has no fixed number of
 * seconds: whole months, and exact seconds. `xs:yearMonthDuration` has only months and
 * `xs:dayTimeDuration` only seconds, and both parts carry the duration's sign.
 *
 * ```ts
 * const span = Duration.parse('-P1Y2M3DT4H5.5S', XS.duration);
 * span.totalMonths;  // -14
 * span.sign;         // -1
 * span.years;        // 1
 * span.days;         // 3
 * span.toString();   // '-P1Y2M3DT4H5.5S'
 * ```
 *
 * The component getters are those of Java's `javax.xml.datatype.Duration`: each is the size of
 * one part, without the sign, which `sign` gives. The months are a safe integer, and the seconds hold
 * at most a safe integer of whole days.
 */
export class Duration<K extends DurationKind = DurationKind> {
  /** The type, such as `XS.dayTimeDuration`. */
  readonly xmlSchemaType: AtomicType<K>;
  /** All the months, with the duration's sign. */
  readonly totalMonths: number;
  /** All the seconds, with the duration's sign, exact. */
  readonly totalSeconds: Decimal;

  /** A duration of a type; XPTY0004 for a type that is not a duration's, FORG0001 for parts it cannot have, FODT0002 for too many days. */
  constructor(type: AtomicType<K>, totalMonths: number, totalSeconds: Decimal) {
    if (!isDurationType(type)) xdmError(XPathErrorCode.TYPE_MISMATCH, `${String(type)} is not a duration type`);
    const kind = type.name.localName as K;
    if (!Number.isSafeInteger(totalMonths)) invalidValue(kind, 'needs a whole number of months');
    if ((totalMonths < 0 && totalSeconds.sign() > 0) || (totalMonths > 0 && totalSeconds.sign() < 0))
      invalidValue(kind, 'needs months and seconds of the same sign');
    if (kind === 'yearMonthDuration' && !totalSeconds.isZero()) invalidValue(kind, 'has no seconds');
    if (kind === 'dayTimeDuration' && totalMonths !== 0) invalidValue(kind, 'has no months');
    safeCount(totalSeconds.truncate() / BigInt(SECONDS_PER_DAY), 'days');
    this.xmlSchemaType = type;
    // -0 is equal to 0, so a zero duration has 0 months either way, and no sign.
    this.totalMonths = totalMonths === 0 ? 0 : totalMonths;
    this.totalSeconds = totalSeconds;
  }

  /** The duration a lexical form names, such as `'P1DT2H'` as `XS.dayTimeDuration`; FORG0001 when it is not one. */
  static parse<K extends DurationKind>(text: string, type: AtomicType<K>): Duration<K> {
    const kind = type.name.localName as K;
    const parts = parseDurationParts(text, kind);
    if (parts === undefined) return invalidValue(kind, `cannot be read from ${JSON.stringify(text)}`);
    return new Duration(type, parts.months, parts.seconds);
  }

  /** The kind of duration, the type's local name, such as `dayTimeDuration`. */
  get kind(): K {
    return this.xmlSchemaType.name.localName as K;
  }

  /** -1, 0 or 1 as the duration is negative, zero or positive. */
  get sign(): number {
    return this.totalMonths === 0 ? this.totalSeconds.sign() : Math.sign(this.totalMonths);
  }

  /** The whole years in the months part. */
  get years(): number {
    return Math.floor(Math.abs(this.totalMonths) / MONTHS_PER_YEAR);
  }

  /** The months left over after the whole years, 0 to 11. */
  get months(): number {
    return Math.abs(this.totalMonths) % MONTHS_PER_YEAR;
  }

  /** The whole days in the seconds part. */
  get days(): number {
    return Number(this.#clock().days);
  }

  /** The hours left over after the whole days, 0 to 23. */
  get hours(): number {
    return this.#clock().hour;
  }

  /** The minutes left over after the whole hours, 0 to 59. */
  get minutes(): number {
    return this.#clock().minute;
  }

  /** The seconds left over after the whole minutes, with their fraction, at least 0 and below 60. */
  get seconds(): Decimal {
    return this.#magnitude().modulo(MINUTE_IN_SECONDS);
  }

  /** The size of the seconds part. */
  #magnitude(): Decimal {
    return absoluteDecimal(this.totalSeconds);
  }

  /** The size of the seconds part as days and a time of day. */
  #clock(): ReturnType<typeof splitSeconds> {
    return splitSeconds(this.#magnitude().truncate());
  }

  /** The canonical lexical form (F&O §19.1.2.2), as XPath casts the duration to a string: `P1Y2M`, `-PT1.5S`, `PT0S`. */
  toString(): string {
    const { days, hour, minute } = this.#clock();
    const date = part(this.years, 'Y') + part(this.months, 'M') + part(days, 'D');
    const seconds = this.seconds;
    const time = part(hour, 'H') + part(minute, 'M') + (seconds.isZero() ? '' : `${seconds.toString()}S`);
    if (date === '' && time === '') return this.kind === 'yearMonthDuration' ? 'P0M' : 'PT0S';
    const sign = this.sign < 0 ? '-' : '';
    return time === '' ? `${sign}P${date}` : `${sign}P${date}T${time}`;
  }
}
