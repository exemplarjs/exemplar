import { FORMATTING_FUNCTIONS } from '@/functions/formatting/index';
import type { FunctionGroup } from '@/functions/function-group';

/** The formatting functions: `format-number`, `format-integer` and the date and time formats. */
export const formattingFunctions: FunctionGroup = { name: 'formatting', functions: FORMATTING_FUNCTIONS };
