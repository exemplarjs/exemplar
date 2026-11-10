import type { QName } from '@exemplarjs/xml';
import type { Decimal } from '@/numeric/decimal';
import { doubleToString } from '@/numeric/double';
import { floatToString } from '@/numeric/float';
import { formatBase64, formatHex } from '@/text/binary';
import { XS } from '@/types/built-in-types';
import type { XdmAtomicValue } from '@/values/atomic-value';

/** A value's canonical text, as XPath casts it to `xs:string` (F&O §19.1.2.2), chosen by its primitive type. */
export function canonicalString(value: XdmAtomicValue): string {
  const content = value.value;
  switch (value.type.primitive) {
    case XS.boolean: {
      return content ? 'true' : 'false';
    }
    case XS.decimal: {
      // Integers hold bigints, other decimals a Decimal; both write themselves canonically.
      return (content as bigint | Decimal).toString();
    }
    case XS.double: {
      return doubleToString(content as number);
    }
    case XS.float: {
      return floatToString(content as number);
    }
    case XS.QName:
    case XS.NOTATION: {
      return (content as QName).toString();
    }
    case XS.hexBinary: {
      return formatHex(content as Uint8Array);
    }
    case XS.base64Binary: {
      return formatBase64(content as Uint8Array);
    }
    default: {
      // The string types, xs:anyURI and xs:untypedAtomic hold their text; dates, times and durations write their own.
      return String(content);
    }
  }
}
