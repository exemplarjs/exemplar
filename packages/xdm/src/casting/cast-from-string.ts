import { XML_NAMESPACE } from '@exemplarjs/xml/internal';
import { XMLGregorianCalendar } from '@/date-time/calendar';
import { parseCalendarFields, parseDurationParts } from '@/date-time/date-time-lexical';
import { Duration } from '@/date-time/duration';
import { Decimal } from '@/numeric/decimal';
import { parseDouble } from '@/numeric/double';
import { parseFloat32 } from '@/numeric/float';
import { parseInteger } from '@/numeric/integer';
import { parseBase64, parseHex } from '@/text/binary';
import { parseQName, type PrefixResolver } from '@/text/qname-value';
import { acceptsText } from '@/text/string-values';
import {
  type AtomicType,
  type CalendarKind,
  type DurationKind,
  isCalendarType,
  isDurationType,
  isIntegerType,
  XS,
} from '@/types/built-in-types';
import type { AtomicContent } from '@/values/atomic-value';

/** The prefixes every context binds: none for unprefixed names, and `xml`. */
export const DEFAULT_PREFIXES: PrefixResolver = (prefix) => {
  if (prefix === '') return '';
  return prefix === 'xml' ? XML_NAMESPACE : undefined;
};

/** The boolean a lexical form of `xs:boolean` names. */
function parseBoolean(text: string): boolean | undefined {
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return undefined;
}

/**
 * The content of a value of a type, read from text its whitespace handling has already been
 * applied to; undefined when the text is not a value of the type. Prefixes in a QName resolve
 * with `resolve`.
 */
export function contentFromText(text: string, type: AtomicType, resolve: PrefixResolver): AtomicContent | undefined {
  if (isCalendarType(type)) {
    const fields = parseCalendarFields(text, type.name.localName as CalendarKind);
    return fields === undefined ? undefined : new XMLGregorianCalendar(type, fields);
  }
  if (isDurationType(type)) {
    const parts = parseDurationParts(text, type.name.localName as DurationKind);
    return parts === undefined ? undefined : new Duration(type, parts.months, parts.seconds);
  }
  switch (type.primitive) {
    case XS.boolean: {
      return parseBoolean(text);
    }
    case XS.decimal: {
      return isIntegerType(type) ? parseInteger(text) : Decimal.parse(text);
    }
    case XS.double: {
      return parseDouble(text);
    }
    case XS.float: {
      return parseFloat32(text);
    }
    case XS.QName: {
      return parseQName(text, resolve);
    }
    case XS.hexBinary: {
      return parseHex(text);
    }
    case XS.base64Binary: {
      return parseBase64(text);
    }
    default: {
      // The string types, xs:anyURI and xs:untypedAtomic take any text their checks accept.
      return acceptsText(type, text) ? text : undefined;
    }
  }
}
