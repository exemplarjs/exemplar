import type { FunctionGroup } from '@/functions/function-group';
import { SERIALIZE_FUNCTIONS } from '@/serialization/serialize';

/** `serialize`, with its XML, text, JSON and adaptive output methods. */
export const serializationFunctions: FunctionGroup = { name: 'serialization', functions: SERIALIZE_FUNCTIONS };
