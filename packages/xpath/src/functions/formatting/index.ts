import type { FunctionDefinition } from '@/functions/function-library';
import { FORMAT_DATE_FUNCTIONS } from './format-date.ts';
import { FORMAT_INTEGER_FUNCTIONS } from './format-integer.ts';
import { FORMAT_NUMBER_FUNCTIONS } from './format-number.ts';

/** The functions that write values as pictures say: `format-integer`, `format-number`, and `format-date` and its kin. */
export const FORMATTING_FUNCTIONS: readonly FunctionDefinition[] = [
  ...FORMAT_INTEGER_FUNCTIONS,
  ...FORMAT_NUMBER_FUNCTIONS,
  ...FORMAT_DATE_FUNCTIONS,
];
