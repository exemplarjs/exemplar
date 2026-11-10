import {
  type DuplicateKeys,
  EMPTY_SEQUENCE,
  isArray,
  isMap,
  type MapEntry,
  XdmArray,
  type XdmAtomicValue,
  type XdmFunction,
  XdmMap,
  type XdmValue,
} from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { booleanResult, integerResult, onlyItem } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { choiceOption, defineWithOptions } from '@/functions/options';
import { defineFunction } from '@/functions/signatures';
import { callFunction } from '@/runtime/function-items';
import { joinedInTurn } from '@/runtime/pausing';

/** Keeps the entry a map has already. */
const FIRST_WINS = (existing: MapEntry): MapEntry => existing;

/** What a `duplicates` option does with a key given twice, as `map:merge` and `parse-json` take it. */
export const DUPLICATE_RULES = {
  reject: ([key]: MapEntry): never =>
    dynamicError(XPathErrorCode.DUPLICATE_JSON_KEY, `The key ${String(key.value)} is given twice`),
  'use-first': FIRST_WINS,
  'use-last': (_existing: MapEntry, added: MapEntry) => added,
  'use-any': FIRST_WINS,
  combine: ([key, existing]: MapEntry, [, added]: MapEntry): MapEntry => [key, [...existing, ...added]],
} satisfies Record<string, DuplicateKeys>;

/** `map:merge`: the entries of every map, a key given twice handled as the options say, by default the first kept. */
function merge(maps: XdmValue, options: XdmMap): XdmValue {
  const duplicates = choiceOption(
    options,
    'duplicates',
    Object.keys(DUPLICATE_RULES) as (keyof typeof DUPLICATE_RULES)[],
    'use-first'
  );
  const entries = (maps as readonly XdmMap[]).flatMap((map) => [...map.entries()]);
  return [XdmMap.of(entries, DUPLICATE_RULES[duplicates])];
}

/** `map:find`: an array of the values of a key in every map within the items, searched through maps and arrays. */
function find(items: XdmValue, key: XdmAtomicValue): XdmValue[] {
  return items.flatMap((item) => {
    if (isArray(item)) return item.members.flatMap((member) => find(member, key));
    if (!isMap(item)) return [];
    const found = item.get(key);
    const inner = [...item.entries()].flatMap(([, value]) => find(value, key));
    return found === undefined ? inner : [found, ...inner];
  });
}

/** The functions on maps (F&O §17.1), in the `map` namespace. */
export const MAP_FUNCTIONS: readonly FunctionDefinition[] = [
  ...defineWithOptions('map:merge($maps as map(*)*) as map(*)', ([maps = []], options) => merge(maps, options)),
  defineFunction('map:size($map as map(*)) as xs:integer', ([map]) => integerResult(onlyItem<XdmMap>(map).size)),
  defineFunction('map:keys($map as map(*)) as xs:anyAtomicType*', ([map]) => onlyItem<XdmMap>(map).keys()),
  defineFunction('map:contains($map as map(*), $key as xs:anyAtomicType) as xs:boolean', ([map, key]) =>
    booleanResult(onlyItem<XdmMap>(map).has(onlyItem(key)))
  ),
  defineFunction(
    'map:get($map as map(*), $key as xs:anyAtomicType) as item()*',
    ([map, key]) => onlyItem<XdmMap>(map).get(onlyItem(key)) ?? EMPTY_SEQUENCE
  ),
  defineFunction('map:find($input as item()*, $key as xs:anyAtomicType) as array(*)', ([items = [], key]) => [
    XdmArray.of(find(items, onlyItem(key))),
  ]),
  defineFunction(
    'map:put($map as map(*), $key as xs:anyAtomicType, $value as item()*) as map(*)',
    ([map, key, value = []]) => [onlyItem<XdmMap>(map).put(onlyItem(key), value)]
  ),
  defineFunction('map:entry($key as xs:anyAtomicType, $value as item()*) as map(*)', ([key, value = []]) => [
    XdmMap.of([[onlyItem(key), value]]),
  ]),
  defineFunction('map:remove($map as map(*), $keys as xs:anyAtomicType*) as map(*)', ([map, keys = []]) => [
    onlyItem<XdmMap>(map).remove(keys as readonly XdmAtomicValue[]),
  ]),
  defineFunction(
    'map:for-each($map as map(*), $action as function(xs:anyAtomicType, item()*) as item()*) as item()*',
    ([map, action]) => {
      const entries = [...onlyItem<XdmMap>(map).entries()];
      const each = onlyItem<XdmFunction>(action);
      return joinedInTurn(entries.length, (index) => {
        const [key, value] = entries[index] as [XdmAtomicValue, XdmValue];
        return callFunction(each, [[key], value]);
      });
    }
  ),
];
