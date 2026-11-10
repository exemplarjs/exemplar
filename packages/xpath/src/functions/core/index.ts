import { FunctionLibrary } from '@/functions/function-library';
import { AGGREGATE_FUNCTIONS } from './aggregates.ts';
import { BOOLEAN_FUNCTIONS } from './booleans.ts';
import { CONTEXT_FUNCTIONS } from './context-functions.ts';
import { ERROR_AND_URI_FUNCTIONS } from './errors-and-uris.ts';
import { NODE_FUNCTIONS } from './nodes.ts';
import { NUMBER_FUNCTIONS } from './numbers.ts';
import { OTHER_LANGUAGE_FUNCTIONS } from './other-languages.ts';
import { QNAME_FUNCTIONS } from './qnames.ts';
import { SEQUENCE_FUNCTIONS } from './sequences.ts';
import { STRING_FUNCTIONS } from './strings.ts';

/** A library of the core functions: accessors, strings, numbers, booleans, sequences, aggregates, nodes, context, QNames, errors, URIs, and those of other languages. */
export function coreLibrary(explainMissing?: FunctionLibrary['explainMissing']): FunctionLibrary {
  return new FunctionLibrary(explainMissing).add(
    ...BOOLEAN_FUNCTIONS,
    ...SEQUENCE_FUNCTIONS,
    ...AGGREGATE_FUNCTIONS,
    ...STRING_FUNCTIONS,
    ...NUMBER_FUNCTIONS,
    ...NODE_FUNCTIONS,
    ...CONTEXT_FUNCTIONS,
    ...QNAME_FUNCTIONS,
    ...ERROR_AND_URI_FUNCTIONS,
    ...OTHER_LANGUAGE_FUNCTIONS
  );
}
