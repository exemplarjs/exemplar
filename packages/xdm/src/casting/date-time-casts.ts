import { fieldsOf, XMLGregorianCalendar } from '@/date-time/calendar';
import { Duration } from '@/date-time/duration';
import { Decimal } from '@/numeric/decimal';
import { type AtomicType, type CalendarKind, isCalendarType, isDurationType, XS } from '@/types/built-in-types';
import { uncheckedAtomicValue, type XdmAtomicValue } from '@/values/atomic-value';

/** The kinds that hold a full date, and so cast to every other date and time type the cast table allows. */
const DATE_KINDS: ReadonlySet<CalendarKind> = new Set(['dateTime', 'dateTimeStamp', 'date']);

/**
 * Casts between the date, time and duration types (F&O §19.1.6 and §19.1.7), or undefined when
 * the value or the target is not one of them: a date or a date and time to any date or time type,
 * keeping the fields the target has; a time or a `xs:g*` value only to its own type; a duration to
 * any duration type, keeping the part the target has. Undefined too for a pair the cast table does
 * not allow, which the caller reports; FORG0001 for a value without a timezone cast to
 * `xs:dateTimeStamp`.
 */
export function castDateTime(value: XdmAtomicValue, target: AtomicType): XdmAtomicValue | undefined {
  if (isDurationType(value.type) && isDurationType(target)) {
    const duration = value.value as Duration;
    const months = target === XS.dayTimeDuration ? 0 : duration.totalMonths;
    const seconds = target === XS.yearMonthDuration ? Decimal.ZERO : duration.totalSeconds;
    return uncheckedAtomicValue(target, new Duration(target, months, seconds));
  }
  if (!isCalendarType(value.type) || !isCalendarType(target)) return undefined;
  const calendar = value.value as XMLGregorianCalendar;
  const targetKind = target.name.localName as CalendarKind;
  if (!DATE_KINDS.has(calendar.kind) && calendar.xmlSchemaType.primitive !== target.primitive) return undefined;
  // A date casts to a date and time, but not to a time, which it has no part of.
  if (calendar.kind === 'date' && targetKind === 'time') return undefined;
  return uncheckedAtomicValue(target, new XMLGregorianCalendar(target, fieldsOf(calendar, targetKind)));
}
