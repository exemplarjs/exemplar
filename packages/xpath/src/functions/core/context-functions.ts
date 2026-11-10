import { EMPTY_SEQUENCE, XdmAtomicValue, XS } from '@exemplarjs/xdm';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { DEFAULT_LANGUAGE } from '@/static/static-context';
import { anyURIResult, integerResult, stringResult } from './values.ts';

/** The context position or size; XPDY0002 when there is no context item. */
function focus(context: DynamicContext, part: 'position' | 'size'): number {
  context.contextItem();
  return context[part];
}

/** The functions that read the context (F&O §15). */
export const CONTEXT_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:position() as xs:integer', (_, context) => integerResult(focus(context, 'position'))),
  defineFunction('fn:last() as xs:integer', (_, context) => integerResult(focus(context, 'size'))),
  defineFunction('fn:static-base-uri() as xs:anyURI?', (_, context) => {
    const base = context.environment.staticContext.baseURI;
    return base === undefined ? EMPTY_SEQUENCE : anyURIResult(base);
  }),
  defineFunction('fn:default-collation() as xs:string', (_, context) =>
    stringResult(context.environment.staticContext.defaultCollation.uri)
  ),
  defineFunction('fn:default-language() as xs:language', () => [XdmAtomicValue.string(DEFAULT_LANGUAGE, XS.language)]),
  // No environment variables are exposed, so that an expression cannot read the process's secrets.
  defineFunction('fn:environment-variable($name as xs:string) as xs:string?', () => EMPTY_SEQUENCE),
  defineFunction('fn:available-environment-variables() as xs:string*', () => EMPTY_SEQUENCE),
];
