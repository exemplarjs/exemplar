import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';

/** Raises FOQM0006: there is no XQuery processor to load a module with. */
function noXQuery(): never {
  return dynamicError(
    XPathErrorCode.NO_XQUERY_PROCESSOR,
    'load-xquery-module() needs an XQuery processor, which is not available'
  );
}

/** Raises FOXT0004: there is no XSLT processor to transform with. */
function noXslt(): never {
  return dynamicError(XPathErrorCode.NO_XSLT_PROCESSOR, 'transform() needs an XSLT processor, which is not available');
}

/** The functions that call on XQuery and XSLT (F&O §18.6 and §18.7), which raise their errors for a processor that is not available. */
export const OTHER_LANGUAGE_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:load-xquery-module($module-uri as xs:string) as map(*)', noXQuery),
  defineFunction('fn:load-xquery-module($module-uri as xs:string, $options as map(*)) as map(*)', noXQuery),
  defineFunction('fn:transform($options as map(*)) as map(*)', noXslt),
];
