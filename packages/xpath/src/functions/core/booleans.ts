import { type FunctionDefinition, ITEMS_THAT_TELL_SEVERAL } from '@/functions/function-library';
import { defineFunction, defineLazyFunction } from '@/functions/signatures';
import { booleanOf, effectiveBooleanValue } from '@/runtime/boolean-value';
import { booleanResult } from './values.ts';

/** `fn:true`, `fn:false`, `fn:boolean` and `fn:not` (F&O §7). */
export const BOOLEAN_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:true() as xs:boolean', () => booleanResult(true)),
  defineFunction('fn:false() as xs:boolean', () => booleanResult(false)),
  defineLazyFunction(ITEMS_THAT_TELL_SEVERAL, 'fn:boolean($arg as item()*) as xs:boolean', ([arg = []]) =>
    booleanOf(arg)
  ),
  defineLazyFunction(ITEMS_THAT_TELL_SEVERAL, 'fn:not($arg as item()*) as xs:boolean', ([arg = []]) =>
    booleanResult(!effectiveBooleanValue(arg))
  ),
];
