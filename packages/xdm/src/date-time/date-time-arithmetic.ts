import { XPathErrorCode, xdmError } from '@/errors';
import { Decimal } from '@/numeric/decimal';
import { type ArithmeticOperator, numericArithmetic } from '@/numeric/numeric-arithmetic';
import { numericKind, toDecimal } from '@/numeric/numeric-values';
import { isCalendarType, isDurationType, isNumericType, XS } from '@/types/built-in-types';
import { uncheckedAtomicValue, type XdmAtomicValue } from '@/values/atomic-value';
import { fieldsOf, movedType, XMLGregorianCalendar } from './calendar.ts';
import { localSeconds, ORDERED_CALENDAR_TYPES, timelineSeconds } from './date-time-comparison.ts';
import { KIND_FIELDS, timezoneFromOption } from './date-time-lexical.ts';
import { Duration } from './duration.ts';
import {
  civilDate,
  daysInMonth,
  floorDivide,
  floorModulo,
  MONTHS_PER_YEAR,
  safeCount,
  safeYear,
  splitSeconds,
} from './gregorian.ts';

/** An operation the operands' types do not support: XPTY0004. */
function unsupported(operator: ArithmeticOperator, first: XdmAtomicValue, second: XdmAtomicValue): never {
  return xdmError(
    XPathErrorCode.TYPE_MISMATCH,
    `${operator} is not defined for values of types ${first.type.toString()} and ${second.type.toString()}`
  );
}

/** A `xs:yearMonthDuration` result of whole months, checked against the months a duration can hold. */
function monthsResult(months: bigint): XdmAtomicValue {
  return uncheckedAtomicValue(
    XS.yearMonthDuration,
    new Duration(XS.yearMonthDuration, safeCount(months, 'months'), Decimal.ZERO)
  );
}

/** A `xs:dayTimeDuration` result of exact seconds. */
function secondsResult(seconds: Decimal): XdmAtomicValue {
  return uncheckedAtomicValue(XS.dayTimeDuration, new Duration(XS.dayTimeDuration, 0, seconds));
}

/** A number multiplying or dividing a duration, as an exact decimal: FOCA0005 for NaN, undefined for an infinity. */
function factorOf(number: XdmAtomicValue): Decimal | undefined {
  const content = number.value;
  if (typeof content === 'number') {
    if (Number.isNaN(content))
      return xdmError(XPathErrorCode.NAN_NOT_ALLOWED, 'A duration cannot be multiplied or divided by NaN');
    if (!Number.isFinite(content)) return undefined;
  }
  return toDecimal(number);
}

/** `ym * n`, `dt * n` and `div n`: months rounded to the nearest month, halves upward, seconds exact; FODT0002 for an infinite result. */
function scaleDuration(duration: Duration, number: XdmAtomicValue, operator: '*' | 'div'): XdmAtomicValue {
  const factor = factorOf(number);
  const divide = operator === 'div';
  if (divide ? factor?.isZero() === true : factor === undefined)
    return xdmError(XPathErrorCode.DURATION_OVERFLOW, 'The duration would be infinite');
  const months = duration.kind === 'yearMonthDuration';
  // Dividing by an infinity gives a zero duration.
  if (factor === undefined) return months ? monthsResult(0n) : secondsResult(Decimal.ZERO);
  const scale = (value: Decimal): Decimal => (divide ? value.divide(factor) : value.multiply(factor));
  const scaled = scale(amountOf(duration));
  return months ? monthsResult(scaled.round(0, 'half-up').truncate()) : secondsResult(scaled);
}

/** A duration's amount: its months for a year-month duration, else its seconds. */
function amountOf(duration: Duration): Decimal {
  return duration.kind === 'yearMonthDuration' ? Decimal.of(BigInt(duration.totalMonths)) : duration.totalSeconds;
}

/** Arithmetic between two durations of one subtype: `+`, `-`, and `div`, which gives their ratio as a decimal. */
function durationsArithmetic(
  operator: ArithmeticOperator,
  first: XdmAtomicValue,
  second: XdmAtomicValue
): XdmAtomicValue {
  const [left, right] = [first.value as Duration, second.value as Duration];
  if (left.kind !== right.kind || left.kind === 'duration') return unsupported(operator, first, second);
  const months = left.kind === 'yearMonthDuration';
  const leftAmount = amountOf(left);
  const rightAmount = amountOf(right);
  if (operator === 'div') return uncheckedAtomicValue(XS.decimal, leftAmount.divide(rightAmount));
  if (operator !== '+' && operator !== '-') return unsupported(operator, first, second);
  const total = operator === '+' ? leftAmount.add(rightAmount) : leftAmount.subtract(rightAmount);
  return months ? monthsResult(total.truncate()) : secondsResult(total);
}

/** A date or date and time moved by whole months: the day pinned to the last of a shorter month (XML Schema Part 2, Appendix E). */
function addMonths(value: XMLGregorianCalendar, months: number): XMLGregorianCalendar {
  const yearMonths = BigInt(MONTHS_PER_YEAR);
  const total = BigInt(value.year as number) * yearMonths + BigInt((value.month as number) - 1) + BigInt(months);
  const year = safeYear(floorDivide(total, yearMonths));
  const month = Number(floorModulo(total, yearMonths)) + 1;
  const day = Math.min(value.day as number, daysInMonth(year, month));
  return new XMLGregorianCalendar(movedType(value), { ...fieldsOf(value), year, month, day });
}

/** A value moved by a number of seconds, in its own local time: a date by whole days from its midnight, a time around the clock. */
export function addSeconds(value: XMLGregorianCalendar, seconds: Decimal): XMLGregorianCalendar {
  const has = KIND_FIELDS[value.kind];
  const local = localSeconds(value).add(seconds);
  const whole = local.round(0, 'floor').truncate();
  const { days, hour, minute, second } = splitSeconds(whole);
  const time = has.time ? { hour, minute, second, fractionalSecond: local.subtract(Decimal.of(whole)) } : {};
  const date = has.day ? civilDate(days) : undefined;
  return new XMLGregorianCalendar(movedType(value), { ...date, ...time, timezone: value.timezone });
}

/** The calendar types a duration of each subtype can move: months move dates, seconds move dates and times. */
const MOVABLE: Readonly<Record<string, ReadonlySet<unknown>>> = {
  yearMonthDuration: new Set([XS.dateTime, XS.date]),
  dayTimeDuration: ORDERED_CALENDAR_TYPES,
};

/** Whether a value is a duration numbers can scale: a `xs:yearMonthDuration` or a `xs:dayTimeDuration`. */
function isScalable(value: XdmAtomicValue): boolean {
  return isDurationType(value.type) && (value.value as Duration).kind !== 'duration';
}

/** Arithmetic with a date or time on one side: one subtracted from another of its type, or one moved by a duration. */
function calendarArithmetic(
  operator: ArithmeticOperator,
  first: XdmAtomicValue,
  second: XdmAtomicValue,
  implicitTimezone: number
): XdmAtomicValue {
  const firstIsCalendar = isCalendarType(first.type);
  if (firstIsCalendar && isCalendarType(second.type)) {
    const primitive = first.type.primitive;
    if (operator !== '-' || primitive !== second.type.primitive || !ORDERED_CALENDAR_TYPES.has(primitive))
      return unsupported(operator, first, second);
    const zone = timezoneFromOption(implicitTimezone);
    const from = timelineSeconds(first.value as XMLGregorianCalendar, zone);
    return secondsResult(from.subtract(timelineSeconds(second.value as XMLGregorianCalendar, zone)));
  }
  const [calendar, duration] = firstIsCalendar ? [first, second] : [second, first];
  const kind = isDurationType(duration.type) ? (duration.value as Duration).kind : 'none';
  // A duration may come first only in an addition.
  const inOrder = operator === '+' || (operator === '-' && firstIsCalendar);
  if (!isCalendarType(calendar.type) || MOVABLE[kind]?.has(calendar.type.primitive) !== true || !inOrder)
    return unsupported(operator, first, second);
  const by = duration.value as Duration;
  const backward = operator === '-';
  const start = calendar.value as XMLGregorianCalendar;
  const months = backward ? -by.totalMonths : by.totalMonths;
  const seconds = backward ? by.totalSeconds.negate() : by.totalSeconds;
  const moved = kind === 'yearMonthDuration' ? addMonths(start, months) : addSeconds(start, seconds);
  return uncheckedAtomicValue(moved.xmlSchemaType, moved);
}

/**
 * Arithmetic on two atomic values, as XPath's arithmetic operators apply it: numbers by numeric
 * arithmetic, and dates, times and durations as F&O §9.4 and §10.5 to §10.8 define: durations
 * added, subtracted, scaled by numbers and divided by each other; dates, times and dates with
 * times subtracted, giving a `xs:dayTimeDuration`, and moved by durations. A value without a
 * timezone takes the implicit one when two are subtracted. XPTY0004 for any other mix, FODT0001
 * and FODT0002 for results out of range.
 */
export function atomicArithmetic(
  operator: ArithmeticOperator,
  first: XdmAtomicValue,
  second: XdmAtomicValue,
  implicitTimezone: number
): XdmAtomicValue {
  if (isNumericType(first.type) && isNumericType(second.type)) return numericArithmetic(operator, first, second);
  const firstIsDuration = isDurationType(first.type);
  const secondIsDuration = isDurationType(second.type);
  if (!firstIsDuration && !secondIsDuration && !isCalendarType(first.type) && !isCalendarType(second.type))
    return numericArithmetic(operator, first, second);
  if (firstIsDuration && secondIsDuration) return durationsArithmetic(operator, first, second);
  if (isScalable(first) && numericKind(second) !== undefined && (operator === '*' || operator === 'div'))
    return scaleDuration(first.value as Duration, second, operator);
  if (isScalable(second) && numericKind(first) !== undefined && operator === '*')
    return scaleDuration(second.value as Duration, first, operator);
  return calendarArithmetic(operator, first, second, implicitTimezone);
}
