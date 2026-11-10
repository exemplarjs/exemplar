import { EMPTY_SEQUENCE } from '@exemplarjs/xdm';
import type { QName } from '@exemplarjs/xml';
import { ErrorFactory } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode, XPathException } from '@/api/xpath-exception';
import type { FunctionDefinition, FunctionImplementation } from '@/functions/function-library';
import { defineFunction, defineWithLast } from '@/functions/signatures';
import { ERROR_NAMESPACE, expandedKey } from '@/static/static-context';
import { absoluteURI, parseUri } from './uri-resolution.ts';
import { anyURIResult, optionalAtomic, optionalString } from './values.ts';

/** An error code as `XPathException.code` holds it: a standard code by its local name, any other as `Q{uri}local`. */
function codeOf(name: QName | undefined): string {
  if (name === undefined) return XPathErrorCode.USER_ERROR;
  return name.namespaceURI === ERROR_NAMESPACE ? name.localName : expandedKey(name);
}

/** `fn:error`: raises the error with a code, description and value, FOER0000 when there is no code. */
const raiseError: FunctionImplementation = ([code, description, value]) => {
  const name = optionalAtomic(code)?.value as QName | undefined;
  const message = optionalString(description) ?? 'An error was raised by fn:error()';
  throw ErrorFactory.create(XPathException, codeOf(name), message, undefined, undefined, value);
};

/**
 * `fn:resolve-uri`: a relative URI resolved against a base, an absolute one as it is; FORG0002
 * for an invalid URI or base, or a base with a fragment; FONS0005 for no base.
 */
function resolveUri(relative: string, base: string | undefined): string {
  const uri = absoluteURI(relative, base);
  if (uri !== undefined) return uri;
  if (parseUri(relative) === undefined) return dynamicError(XPathErrorCode.INVALID_URI, `"${relative}" is not a URI`);
  if (base === undefined) return dynamicError(XPathErrorCode.NO_BASE_URI, 'There is no base URI to resolve against');
  return dynamicError(XPathErrorCode.INVALID_URI, `"${base}" is not an absolute URI without a fragment`);
}

/** `fn:error` and `fn:trace` (F&O §3), and `fn:resolve-uri` (§6.1). */
export const ERROR_AND_URI_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:error() as none', raiseError),
  defineFunction('fn:error($code as xs:QName?) as none', raiseError),
  defineFunction('fn:error($code as xs:QName?, $description as xs:string) as none', raiseError),
  defineFunction(
    'fn:error($code as xs:QName?, $description as xs:string, $error-object as item()*) as none',
    raiseError
  ),
  ...defineWithLast('fn:trace($value as item()*) as item()*', '$label as xs:string', ([value = []]) => value),
  ...defineWithLast(
    'fn:resolve-uri($relative as xs:string?) as xs:anyURI?',
    '$base as xs:string',
    ([relative], base, context) => {
      const text = optionalString(relative);
      if (text === undefined) return EMPTY_SEQUENCE;
      // The static base URI when no base is given
      const baseURI = base === undefined ? context.environment.staticContext.baseURI : optionalString(base);
      return anyURIResult(resolveUri(text, baseURI));
    }
  ),
];
