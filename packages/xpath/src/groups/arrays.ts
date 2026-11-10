import { ARRAY_FUNCTIONS } from '@/functions/arrays/array-functions';
import type { FunctionGroup } from '@/functions/function-group';

/** The `array:` functions; array constructors and lookups are part of the language and need no group. */
export const arrayFunctions: FunctionGroup = { name: 'arrays', functions: ARRAY_FUNCTIONS };
