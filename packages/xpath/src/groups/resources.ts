import { RESOURCE_FUNCTIONS } from '@/functions/documents/index';
import type { FunctionGroup } from '@/functions/function-group';

/** The functions that read resources and parse XML: `doc`, `collection`, `unparsed-text`, `json-doc`, `parse-xml` and their kin. */
export const resourceFunctions: FunctionGroup = { name: 'resources', functions: RESOURCE_FUNCTIONS };
