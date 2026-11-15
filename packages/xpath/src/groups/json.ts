import type { FunctionGroup } from '@/functions/function-group';
import { JSON_TO_XML_FUNCTIONS } from '@/functions/json/json-to-xml';
import { PARSE_JSON_FUNCTIONS } from '@/functions/json/parse-json';
import { XML_TO_JSON_FUNCTIONS } from '@/functions/json/xml-to-json';

/** The JSON functions: `parse-json`, `json-to-xml` and `xml-to-json`. */
export const jsonFunctions: FunctionGroup = {
  name: 'json',
  functions: [...PARSE_JSON_FUNCTIONS, ...JSON_TO_XML_FUNCTIONS, ...XML_TO_JSON_FUNCTIONS],
};
