import type { FunctionGroup } from '@/functions/function-group';
import { arrayFunctions } from './arrays.ts';
import { dateTimeFunctions } from './date-time.ts';
import { formattingFunctions } from './formatting.ts';
import { higherOrderFunctions } from './higher-order.ts';
import { jsonFunctions } from './json.ts';
import { mapFunctions } from './maps.ts';
import { regexFunctions } from './regex.ts';
import { resourceFunctions } from './resources.ts';
import { serializationFunctions } from './serialization.ts';

/** Every function group, as the full entry's compiler has them. */
export const ALL_GROUPS: readonly FunctionGroup[] = [
  dateTimeFunctions,
  formattingFunctions,
  regexFunctions,
  higherOrderFunctions,
  mapFunctions,
  arrayFunctions,
  jsonFunctions,
  resourceFunctions,
  serializationFunctions,
];
