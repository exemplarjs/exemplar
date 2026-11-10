import type { QName } from '@exemplarjs/xml';
import type { XMLGregorianCalendar } from '@/date-time/calendar';
import { localSeconds, timelineSeconds } from '@/date-time/date-time-comparison';
import type { Duration } from '@/date-time/duration';
import { exactDecimal, NumericKind, numericKind } from '@/numeric/numeric-values';
import { formatHex } from '@/text/binary';
import { isStringLike } from '@/text/string-values';
import { isCalendarType, isDurationType, XS } from '@/types/built-in-types';
import type { XdmAtomicValue } from '@/values/atomic-value';

/** The first character of each kind of key; they must all differ, so keys of different kinds never collide. */
const KeyTag = {
  STRING: 's',
  NUMBER: 'n',
  LOCAL_TIME: 'c',
  TIMELINE_TIME: 'z',
  DURATION: 'd',
  NAME: 'q',
  BINARY: 'x',
  OTHER: 'b',
} as const;

/** The key of a number: its exact value, so that `1`, `1.0` and `1e0` agree but `1.1` and `1.1e0` do not; NaN and the infinities by name. */
function numericKey(value: XdmAtomicValue, kind: NumericKind): string {
  if (kind === NumericKind.INTEGER) return `${KeyTag.NUMBER}${String(value.value)}`;
  const number = value.value;
  if (typeof number === 'number' && !Number.isFinite(number)) return `${KeyTag.NUMBER}${String(number)}`;
  return `${KeyTag.NUMBER}${exactDecimal(value).toString()}`;
}

/** The key of a date or time: by its primitive type, on the timeline when it has a timezone, else by its local time. */
function calendarKey(value: XMLGregorianCalendar): string {
  const type = value.xmlSchemaType.primitive.name.localName;
  return value.timezone === undefined
    ? `${KeyTag.LOCAL_TIME}${type} ${localSeconds(value).toString()}`
    : `${KeyTag.TIMELINE_TIME}${type} ${timelineSeconds(value, 0).toString()}`;
}

/**
 * A string that two atomic values share exactly when they are the same key (F&O §14.1.1,
 * `op:same-key`): strings, URIs and untyped values by their code points; numbers by their exact
 * value as a decimal, NaN equal to NaN; dates and times only when both or neither have a timezone;
 * durations by their months and seconds; anything else by its type and value.
 *
 * @example
 * sameKeyOf(XdmAtomicValue.integer(1n)) === sameKeyOf(XdmAtomicValue.double(1)); // true
 */
export function sameKeyOf(value: XdmAtomicValue): string {
  const type = value.type;
  if (isStringLike(type)) return `${KeyTag.STRING}${value.value as string}`;
  const kind = numericKind(value);
  if (kind !== undefined) return numericKey(value, kind);
  if (isCalendarType(type)) return calendarKey(value.value as XMLGregorianCalendar);
  if (isDurationType(type)) {
    const duration = value.value as Duration;
    return `${KeyTag.DURATION}${duration.totalMonths} ${duration.totalSeconds.toString()}`;
  }
  const primitive = type.primitive;
  if (primitive === XS.QName || primitive === XS.NOTATION) {
    const name = value.value as QName;
    return `${KeyTag.NAME}${primitive.name.localName} Q{${name.namespaceURI}}${name.localName}`;
  }
  if (value.value instanceof Uint8Array) return `${KeyTag.BINARY}${primitive.name.localName} ${formatHex(value.value)}`;
  return `${KeyTag.OTHER}${String(value.value)}`;
}
