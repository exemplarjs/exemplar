import { splitWhitespace } from '@exemplarjs/xml/internal';
import type { FunctionGroup } from '@/functions/function-group';

/**
 * The functions of each group, `fn:` ones by local name and others by prefix, so that
 * `compileAsync` can tell which groups an expression calls without loading any.
 */
export const GROUP_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  'date-time': splitWhitespace(`
    years-from-duration months-from-duration days-from-duration hours-from-duration minutes-from-duration
    seconds-from-duration year-from-dateTime month-from-dateTime day-from-dateTime hours-from-dateTime
    minutes-from-dateTime seconds-from-dateTime timezone-from-dateTime year-from-date month-from-date
    day-from-date timezone-from-date hours-from-time minutes-from-time seconds-from-time timezone-from-time
    dateTime adjust-dateTime-to-timezone adjust-date-to-timezone adjust-time-to-timezone current-dateTime
    current-date current-time implicit-timezone parse-ietf-date
  `),
  formatting: splitWhitespace('format-integer format-number format-dateTime format-date format-time'),
  regex: splitWhitespace('matches replace tokenize analyze-string'),
  'higher-order': splitWhitespace(`
    function-lookup function-name function-arity for-each filter fold-left fold-right for-each-pair apply sort
    random-number-generator
  `),
  maps: splitWhitespace(`
    map:merge map:size map:keys map:contains map:get map:find map:put map:entry map:remove map:for-each
  `),
  arrays: splitWhitespace(`
    array:size array:get array:put array:append array:subarray array:remove array:insert-before array:head
    array:tail array:reverse array:join array:for-each array:filter array:fold-left array:fold-right
    array:for-each-pair array:sort array:flatten
  `),
  json: splitWhitespace('parse-json json-to-xml xml-to-json'),
  resources: splitWhitespace(`
    doc doc-available parse-xml parse-xml-fragment unparsed-text unparsed-text-lines unparsed-text-available
    json-doc collection uri-collection
  `),
  serialization: splitWhitespace('serialize'),
};

/** A group's module: the name of the group's export, as an XPST0017 suggests adding it, and how to load the group. */
export interface GroupModule {
  readonly exportName: string;
  readonly load: () => Promise<FunctionGroup>;
}

/** A group's module, from its export's name and its module's import. */
function groupModule(exportName: string, load: () => Promise<object>): GroupModule {
  return {
    exportName,
    load: () => load().then((module) => (module as Record<string, FunctionGroup>)[exportName] as FunctionGroup),
  };
}

/** The module of each group by name, each imported on its own, so that a bundler splits them apart. */
export const GROUP_MODULES: Readonly<Record<string, GroupModule>> = {
  'date-time': groupModule('dateTimeFunctions', () => import('@/groups/date-time.ts')),
  formatting: groupModule('formattingFunctions', () => import('@/groups/formatting.ts')),
  regex: groupModule('regexFunctions', () => import('@/groups/regex.ts')),
  'higher-order': groupModule('higherOrderFunctions', () => import('@/groups/higher-order.ts')),
  maps: groupModule('mapFunctions', () => import('@/groups/maps.ts')),
  arrays: groupModule('arrayFunctions', () => import('@/groups/arrays.ts')),
  json: groupModule('jsonFunctions', () => import('@/groups/json.ts')),
  resources: groupModule('resourceFunctions', () => import('@/groups/resources.ts')),
  serialization: groupModule('serializationFunctions', () => import('@/groups/serialization.ts')),
};
