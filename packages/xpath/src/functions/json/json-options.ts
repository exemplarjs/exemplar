import type { XdmFunction, XdmMap } from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { onlyItem, stringArgument, stringResult } from '@/functions/core/values';
import { booleanOption, optionValue } from '@/functions/options';
import { callFunction } from '@/runtime/function-items';
import { promiseNotAwaited } from '@/runtime/resources';
import { type JsonValue, parseJson, type StringDecoder } from './json-parser.ts';
import { decodeEscapes, keepEscapes } from './json-strings.ts';

/**
 * The string decoder the `escape` and `fallback` options ask for: escapes kept, or decoded with
 * the fallback function for characters XML cannot hold. FOJS0005 when both are given, as a
 * fallback has nothing to do when escapes are kept.
 */
function stringDecoder(options: XdmMap): StringDecoder {
  const escape = booleanOption(options, 'escape', false);
  const fallback = optionValue(options, 'fallback', 'function(xs:string) as xs:string');
  if (escape && fallback !== undefined)
    return dynamicError(XPathErrorCode.INVALID_OPTION, 'The options escape and fallback cannot be given together');
  if (escape) return keepEscapes;
  if (fallback === undefined) return decodeEscapes(undefined);
  const action = onlyItem<XdmFunction>(fallback);
  return decodeEscapes((written) => {
    const result = callFunction(action, [stringResult(written)]);
    if (result instanceof Promise)
      throw promiseNotAwaited('A fallback function must answer at once, without reading a resource');
    return stringArgument(result);
  });
}

/**
 * JSON text read as the options `parse-json` and `json-to-xml` share say: `liberal`, which is
 * checked but reads strict JSON, as F&O allows, and the string options `escape` and `fallback`.
 */
export function readJson(text: string, options: XdmMap): JsonValue {
  booleanOption(options, 'liberal', false);
  return parseJson(text, stringDecoder(options));
}
