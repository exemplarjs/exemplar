import { EMPTY_SEQUENCE, XdmArray, XdmAtomicValue, XdmMap, type XdmValue } from '@exemplarjs/xdm';
import { booleanResult, doubleResult, optionalString, stringResult } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { DUPLICATE_RULES } from '@/functions/maps/map-functions';
import { choiceOption, defineWithOptions } from '@/functions/options';
import { readJson } from './json-options.ts';
import type { JsonValue } from './json-parser.ts';

/** The values of `parse-json`'s `duplicates` option. */
const DUPLICATE_CHOICES = ['reject', 'use-first', 'use-last'] as const;

/** A JSON value as XPath values: an object as a map, an array as an array, a number as a double, null as the empty sequence. */
function toXdm(value: JsonValue, duplicates: (typeof DUPLICATE_CHOICES)[number]): XdmValue {
  switch (value.kind) {
    case 'object': {
      const entries = value.entries.map(
        (entry) => [XdmAtomicValue.string(entry.key), toXdm(entry.value, duplicates)] as const
      );
      return [XdmMap.of(entries, DUPLICATE_RULES[duplicates])];
    }
    case 'array': {
      return [XdmArray.of(value.members.map((member) => toXdm(member, duplicates)))];
    }
    case 'string': {
      return stringResult(value.text);
    }
    case 'number': {
      return doubleResult(Number(value.text));
    }
    case 'boolean': {
      return booleanResult(value.value);
    }
    default: {
      return EMPTY_SEQUENCE;
    }
  }
}

/** JSON text as XPath values, read as `parse-json`'s options say, as `parse-json` and `json-doc` give it. */
export function jsonValue(json: string, options: XdmMap): XdmValue {
  const duplicates = choiceOption(options, 'duplicates', DUPLICATE_CHOICES, 'use-first');
  return toXdm(readJson(json, options), duplicates);
}

/** `fn:parse-json`, with and without options: JSON text as maps, arrays and atomic values; the empty sequence for none. */
export const PARSE_JSON_FUNCTIONS: readonly FunctionDefinition[] = defineWithOptions(
  'fn:parse-json($json-text as xs:string?) as item()?',
  ([text], options) => {
    const json = optionalString(text);
    return json === undefined ? EMPTY_SEQUENCE : jsonValue(json, options);
  }
);
