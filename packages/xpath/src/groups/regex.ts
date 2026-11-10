import type { FunctionGroup } from '@/functions/function-group';
import { ANALYZE_STRING_FUNCTIONS } from '@/functions/regex/analyze-string';
import { REGEX_FUNCTIONS } from '@/functions/regex/regex-functions';

/** The regular expression functions: `matches`, `replace`, `tokenize` and `analyze-string`. */
export const regexFunctions: FunctionGroup = {
  name: 'regex',
  functions: [...REGEX_FUNCTIONS, ...ANALYZE_STRING_FUNCTIONS],
};
