import {
  type AtomicType,
  castAs,
  Duration,
  EMPTY_SEQUENCE,
  XdmAtomicValue,
  type XdmValue,
  XMLGregorianCalendar,
  XS,
} from '@exemplarjs/xdm';
import { adjustToTimezone, fieldsOf, isTimezone, MINUTE_IN_SECONDS, timezoneSeconds } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { optionalAtomic } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';

/** A timezone in minutes east of UTC as the `xs:dayTimeDuration` XPath gives it. */
export function timezoneDuration(minutes: number): XdmValue {
  return [XdmAtomicValue.duration(new Duration(XS.dayTimeDuration, 0, timezoneSeconds(minutes)))];
}

/** A timezone given as a `xs:dayTimeDuration`, in minutes: FODT0003 unless it is whole minutes within 14 hours of UTC. */
function timezoneMinutes(duration: Duration): number {
  const minutes = duration.totalSeconds.divide(MINUTE_IN_SECONDS);
  if (!minutes.isInteger() || !isTimezone(minutes.toNumber()))
    return dynamicError(
      XPathErrorCode.INVALID_TIMEZONE,
      `${duration.toString()} is not a timezone within 14 hours of UTC`
    );
  return minutes.toNumber();
}

/** `fn:adjust-dateTime-to-timezone` and its kin: to the implicit timezone with one argument, to the given one or none with two. */
function adjust(args: readonly XdmValue[], context: DynamicContext): XdmValue {
  const value = optionalAtomic(args[0])?.value as XMLGregorianCalendar | undefined;
  if (value === undefined) return EMPTY_SEQUENCE;
  if (args.length === 1)
    return [XdmAtomicValue.calendar(adjustToTimezone(value, context.environment.implicitTimezone))];
  const duration = optionalAtomic(args[1])?.value as Duration | undefined;
  const zone = duration === undefined ? undefined : timezoneMinutes(duration);
  return [XdmAtomicValue.calendar(adjustToTimezone(value, zone))];
}

/** `fn:dateTime`: a date and a time joined, with the timezone of either; FORG0008 when both have one and they differ. */
function joinDateAndTime(dateValue: XdmValue | undefined, timeValue: XdmValue | undefined): XdmValue {
  const date = optionalAtomic(dateValue)?.value as XMLGregorianCalendar<'date'> | undefined;
  const time = optionalAtomic(timeValue)?.value as XMLGregorianCalendar<'time'> | undefined;
  if (date === undefined || time === undefined) return EMPTY_SEQUENCE;
  if (date.timezone !== undefined && time.timezone !== undefined && date.timezone !== time.timezone)
    return dynamicError(
      XPathErrorCode.CONFLICTING_TIMEZONES,
      `${date.toString()} and ${time.toString()} have different timezones`
    );
  const timezone = date.timezone ?? time.timezone;
  const joined = new XMLGregorianCalendar(XS.dateTime, { ...fieldsOf(date), ...fieldsOf(time), timezone });
  return [XdmAtomicValue.calendar(joined)];
}

/** The current date and time in the implicit timezone, to the millisecond, as a value of a date or time type. */
function now(context: DynamicContext, type: AtomicType<'dateTimeStamp' | 'date' | 'time'>): XdmValue {
  const { currentDateTime, implicitTimezone } = context.environment;
  const local = adjustToTimezone(XMLGregorianCalendar.fromDate(currentDateTime), implicitTimezone);
  return [castAs(XdmAtomicValue.calendar(local), type)];
}

/** `fn:adjust-dateTime-to-timezone` and its kin for each type, with and without a timezone. */
const ADJUST_FUNCTIONS = (['dateTime', 'date', 'time'] as const).flatMap((type) => [
  defineFunction(`fn:adjust-${type}-to-timezone($arg as xs:${type}?) as xs:${type}?`, adjust),
  defineFunction(
    `fn:adjust-${type}-to-timezone($arg as xs:${type}?, $timezone as xs:dayTimeDuration?) as xs:${type}?`,
    adjust
  ),
]);

/** The functions on timezones and the clock (F&O §9.3, §9.6 and §15.3), and `fn:dateTime`. */
export const TIMEZONE_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:dateTime($arg1 as xs:date?, $arg2 as xs:time?) as xs:dateTime?', ([date, time]) =>
    joinDateAndTime(date, time)
  ),
  ...ADJUST_FUNCTIONS,
  defineFunction('fn:current-dateTime() as xs:dateTimeStamp', (_, context) => now(context, XS.dateTimeStamp)),
  defineFunction('fn:current-date() as xs:date', (_, context) => now(context, XS.date)),
  defineFunction('fn:current-time() as xs:time', (_, context) => now(context, XS.time)),
  defineFunction('fn:implicit-timezone() as xs:dayTimeDuration', (_, context) =>
    timezoneDuration(context.environment.implicitTimezone)
  ),
];
