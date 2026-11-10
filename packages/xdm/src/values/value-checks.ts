import { QName } from '@exemplarjs/xml';
import { XMLGregorianCalendar } from '@/date-time/calendar';
import { Duration } from '@/date-time/duration';
import { XPathErrorCode, xdmError } from '@/errors';
import { Decimal } from '@/numeric/decimal';
import { inIntegerRange } from '@/numeric/integer';
import { acceptsText, applyWhitespace, whitespaceOf } from '@/text/string-values';
import { type AtomicType, isCalendarType, isDurationType, isIntegerType, XS } from '@/types/built-in-types';

/** Content of the wrong kind for a type, or a type no value can have: XPTY0004. */
function wrongKind(type: AtomicType, reason: string): never {
  return xdmError(XPathErrorCode.TYPE_MISMATCH, `A value of type ${type.toString()} cannot be ${reason}`);
}

/** A value the type cannot hold: FORG0001. */
function notInType(type: AtomicType, content: unknown): never {
  return xdmError(XPathErrorCode.INVALID_VALUE_FOR_CAST, `${String(content)} is not a valid ${type.toString()}`);
}

/** Whether content is what a type's primitive type holds, as `AtomicContent` describes; a date, time or duration of the type itself. */
function hasKindOf(type: AtomicType, content: unknown): boolean {
  switch (type.primitive) {
    case XS.boolean: {
      return typeof content === 'boolean';
    }
    case XS.decimal: {
      return isIntegerType(type) ? typeof content === 'bigint' : content instanceof Decimal;
    }
    case XS.double: {
      return typeof content === 'number';
    }
    case XS.float: {
      // A float holds only numbers single precision can represent.
      return typeof content === 'number' && (Number.isNaN(content) || Math.fround(content) === content);
    }
    case XS.QName: {
      return content instanceof QName;
    }
    case XS.hexBinary:
    case XS.base64Binary: {
      return content instanceof Uint8Array;
    }
    default: {
      if (isCalendarType(type)) return content instanceof XMLGregorianCalendar && content.xmlSchemaType === type;
      if (isDurationType(type)) return content instanceof Duration && content.xmlSchemaType === type;
      return typeof content === 'string';
    }
  }
}

/**
 * Checks that content is a value of a type: of the kind its primitive holds, in range for an
 * integer type, and for text, already in its whitespace form and accepted by its rules. Raises
 * XPTY0004 for the wrong kind or an abstract type, and FORG0001 for a value outside the type.
 */
export function checkContent(type: AtomicType, content: unknown): void {
  if (type.abstract) wrongKind(type, 'made, as the type is abstract');
  if (!hasKindOf(type, content)) wrongKind(type, `made from ${typeof content} content ${String(content)}`);
  if (typeof content === 'bigint') {
    if (!inIntegerRange(content, type)) notInType(type, content);
  } else if (typeof content === 'string') {
    const whitespaceHandled = applyWhitespace(content, whitespaceOf(type)) === content;
    if (!whitespaceHandled || !acceptsText(type, content)) notInType(type, JSON.stringify(content));
  }
}
