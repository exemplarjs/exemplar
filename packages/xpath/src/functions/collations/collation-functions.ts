import { XdmAtomicValue, XS } from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { defineWithCollation, stringArgument } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';

/** `fn:collation-key` (F&O §5.3.6): bytes that compare as the string does by the collation; FOCH0004 for a collation without keys. */
export const COLLATION_FUNCTIONS: readonly FunctionDefinition[] = defineWithCollation(
  'fn:collation-key($key as xs:string) as xs:base64Binary',
  ([key], _, collation) => {
    const bytes = collation.key(stringArgument(key));
    if (bytes === undefined)
      return dynamicError(
        XPathErrorCode.COLLATION_KEYS_UNSUPPORTED,
        `The collation ${collation.uri} gives no collation keys`
      );
    return [new XdmAtomicValue(XS.base64Binary, bytes)];
  }
);
