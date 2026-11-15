import { fieldsOf, movedType, XMLGregorianCalendar } from './calendar.ts';
import { addSeconds } from './date-time-arithmetic.ts';
import { timezoneSeconds } from './gregorian.ts';

/**
 * A date or time value in another timezone, as `fn:adjust-dateTime-to-timezone` and its kin give
 * it (F&O §10.7): with no timezone, the same local fields without one; for a value without a
 * timezone, the same fields with the new one; otherwise the same instant, its local fields moved
 * by the difference. A date moves as its midnight does. A `xs:dateTimeStamp` gives a `xs:dateTime`,
 * the type F&O declares for the result.
 */
export function adjustToTimezone(value: XMLGregorianCalendar, timezone: number | undefined): XMLGregorianCalendar {
  let moved = value;
  if (timezone !== undefined && value.timezone !== undefined)
    moved = addSeconds(value, timezoneSeconds(timezone - value.timezone));
  return new XMLGregorianCalendar(movedType(value), { ...fieldsOf(moved), timezone });
}
