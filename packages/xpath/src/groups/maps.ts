import type { FunctionGroup } from '@/functions/function-group';
import { MAP_FUNCTIONS } from '@/functions/maps/map-functions';

/** The `map:` functions; map constructors and lookups are part of the language and need no group. */
export const mapFunctions: FunctionGroup = { name: 'maps', functions: MAP_FUNCTIONS };
