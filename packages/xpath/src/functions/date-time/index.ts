import type { FunctionDefinition } from '@/functions/function-library';
import { COMPONENT_FUNCTIONS } from './components.ts';
import { IETF_DATE_FUNCTIONS } from './parse-ietf-date.ts';
import { TIMEZONE_FUNCTIONS } from './timezones.ts';

/** The functions on dates, times and durations: their components, timezones, the clock and `parse-ietf-date`. */
export const DATE_TIME_FUNCTIONS: readonly FunctionDefinition[] = [
  ...COMPONENT_FUNCTIONS,
  ...TIMEZONE_FUNCTIONS,
  ...IETF_DATE_FUNCTIONS,
];
