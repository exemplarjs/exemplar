import { DATE_TIME_FUNCTIONS } from '@/functions/date-time/index';
import type { FunctionGroup } from '@/functions/function-group';

/** The date, time and duration functions: components, timezone adjustment and `parse-ietf-date`. */
export const dateTimeFunctions: FunctionGroup = { name: 'date-time', functions: DATE_TIME_FUNCTIONS };
