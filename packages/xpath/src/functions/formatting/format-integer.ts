import { LruCache } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { optionalAtomic, stringArgument, stringResult } from '@/functions/core/values';
import { CALL_CACHE_CAPACITY, type FunctionDefinition } from '@/functions/function-library';
import { defineStatefulWithLast, type LastImplementation } from '@/functions/signatures';
import {
  FORMAT_MODIFIER,
  formatInteger,
  type IntegerStyle,
  parsePrimaryToken,
  type PrimaryToken,
} from './integer-format.ts';

/** A whole format modifier. */
const WHOLE_MODIFIER = new RegExp(`^${FORMAT_MODIFIER}$`);

/** A `format-integer` picture read: its primary token and whether it asks for an ordinal. */
interface IntegerPicture {
  readonly token: PrimaryToken;
  readonly style: IntegerStyle;
}

/**
 * Reads a `format-integer` picture: the primary token before the last `;`, and the format
 * modifier after it. FODF1310 for an empty token or a modifier that is not one.
 */
function parseIntegerPicture(picture: string): IntegerPicture {
  const separator = picture.lastIndexOf(';');
  const token = separator === -1 ? picture : picture.slice(0, separator);
  const modifier = separator === -1 ? '' : picture.slice(separator + 1);
  if (token === '') dynamicError(XPathErrorCode.INVALID_NUMBER_PICTURE, `The picture '${picture}' has no format token`);
  if (!WHOLE_MODIFIER.test(modifier))
    dynamicError(XPathErrorCode.INVALID_NUMBER_PICTURE, `'${modifier}' is not a format modifier`);
  return {
    token: parsePrimaryToken(token, XPathErrorCode.INVALID_NUMBER_PICTURE),
    style: { ordinal: modifier.startsWith('o') },
  };
}

/**
 * `fn:format-integer`: an integer as a picture writes it, `''` for the empty sequence. Words and
 * ordinals are English whatever the language asked for. Each place it is called from keeps the
 * pictures it has parsed.
 */
function integerFormatter(): LastImplementation {
  const pictures = new LruCache<string, IntegerPicture>(CALL_CACHE_CAPACITY);
  return (args) => {
    const picture = pictures.computeIfAbsent(stringArgument(args[1]), parseIntegerPicture);
    const value = optionalAtomic(args[0])?.value as bigint | undefined;
    return stringResult(value === undefined ? '' : formatInteger(value, picture.token, picture.style));
  };
}

/** `fn:format-integer` with and without a language (F&O §4.6.1). */
export const FORMAT_INTEGER_FUNCTIONS: readonly FunctionDefinition[] = defineStatefulWithLast(
  'fn:format-integer($value as xs:integer?, $picture as xs:string) as xs:string',
  '$lang as xs:string?',
  integerFormatter
);
