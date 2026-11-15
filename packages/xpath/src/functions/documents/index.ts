import type { FunctionDefinition } from '@/functions/function-library';
import { COLLECTION_FUNCTIONS } from './collections.ts';
import { DOCUMENT_FUNCTIONS } from './documents.ts';
import { TEXT_RESOURCE_FUNCTIONS } from './text-resources.ts';

/** The functions that read documents, text and collections, and parse XML from strings. */
export const RESOURCE_FUNCTIONS: readonly FunctionDefinition[] = [
  ...DOCUMENT_FUNCTIONS,
  ...TEXT_RESOURCE_FUNCTIONS,
  ...COLLECTION_FUNCTIONS,
];
