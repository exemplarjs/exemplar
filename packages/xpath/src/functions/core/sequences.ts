import {
  type AtomicType,
  type ComparisonOptions,
  isNumericType,
  XS,
  type XdmAtomicValue,
  type XdmItem,
  type XdmValue,
} from '@exemplarjs/xdm';
import { isStringLike } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { type Collation, codepointCollation } from '@/functions/collations/collation';
import { type FunctionDefinition, ITEMS_THAT_TELL_SEVERAL } from '@/functions/function-library';
import { defineFunction, defineLazyFunction, defineWithLast } from '@/functions/signatures';
import { atomicEqual, strictlyEqual } from '@/runtime/atomic-equality';
import { atomize } from '@/runtime/atomization';
import { deepEqual } from '@/runtime/deep-equal';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { stringValueOf } from './strings.ts';
import {
  booleanResult,
  comparisonWith,
  defineWithCollation,
  integerResult,
  numberArgument,
  onlyItem,
  roundedSlice,
} from './values.ts';

/** What a string's same-value key starts with; every other key starts with a type name such as `xs:date`. */
const STRING_KEY = 's';

/**
 * A key that equal values of one primitive type always share, so that only values with one key need
 * comparing: a number by its value, a string by its text under the codepoint collation, any other
 * value by its primitive type alone.
 */
function sameValueKey(value: XdmAtomicValue, byCodepoints: boolean): string {
  const primitive = value.type.primitive;
  if (isNumericType(primitive)) {
    // A double or float as a number, so that -0 and 0 share a key; a decimal by its canonical text.
    const exact = primitive === XS.decimal ? stringValueOf(value) : String(Number(value.value));
    return `${primitive.toString()} ${exact}`;
  }
  if (!isStringLike(primitive)) return primitive.toString();
  return byCodepoints ? `${STRING_KEY}${String(value.value)}` : STRING_KEY;
}

/** `fn:distinct-values`: the first of each set of equal values, in order. */
function distinctValues(items: XdmValue, collation: Collation, context: DynamicContext): XdmValue {
  const options = comparisonWith(context, collation);
  const seenByKey = new Map<string, XdmAtomicValue[]>();
  const distinct: XdmAtomicValue[] = [];
  // Numbers of different primitive types compare by promotion, so once they mix, each is compared with every number kept.
  const numbers: XdmAtomicValue[] = [];
  const numberTypes = new Set<AtomicType>();
  for (const value of atomize(items)) {
    const isNumber = isNumericType(value.type);
    if (isNumber) numberTypes.add(value.type.primitive);
    const key = sameValueKey(value, collation === codepointCollation);
    const mixedNumbers = isNumber && numberTypes.size > 1;
    const keptWithKey = seenByKey.get(key);
    const candidates = mixedNumbers ? numbers : keptWithKey;
    if (candidates?.some((other) => atomicEqual(other, value, options)) === true) continue;
    if (keptWithKey === undefined) seenByKey.set(key, [value]);
    else keptWithKey.push(value);
    if (isNumber) numbers.push(value);
    distinct.push(value);
  }
  return distinct;
}

/** `fn:index-of`: the positions of the values equal to the search value by `eq`, under which NaN equals nothing. */
function indexOf(items: XdmValue, search: XdmAtomicValue, options: ComparisonOptions): XdmValue {
  const positions: XdmItem[] = [];
  for (const [index, value] of atomize(items).entries()) {
    if (strictlyEqual(value, search, options)) positions.push(...integerResult(index + 1));
  }
  return positions;
}

/** The functions on sequences (F&O §14.1 and §14.2), and `fn:count`. */
export const SEQUENCE_FUNCTIONS: readonly FunctionDefinition[] = [
  defineLazyFunction(1, 'fn:empty($arg as item()*) as xs:boolean', ([arg = []]) => booleanResult(arg.length === 0)),
  defineLazyFunction(1, 'fn:exists($arg as item()*) as xs:boolean', ([arg = []]) => booleanResult(arg.length > 0)),
  defineLazyFunction('count', 'fn:count($arg as item()*) as xs:integer', ([arg = []]) => integerResult(arg.length)),
  defineLazyFunction(1, 'fn:head($arg as item()*) as item()?', ([arg = []]) => arg.slice(0, 1)),
  defineFunction('fn:tail($arg as item()*) as item()*', ([arg = []]) => arg.slice(1)),
  defineFunction('fn:reverse($arg as item()*) as item()*', ([arg = []]) => arg.toReversed()),
  defineFunction('fn:unordered($sourceSeq as item()*) as item()*', ([items = []]) => items),
  defineFunction(
    'fn:insert-before($target as item()*, $position as xs:integer, $inserts as item()*) as item()*',
    ([target = [], at, inserts = []]) => {
      const index = Math.min(Math.max(numberArgument(at), 1), target.length + 1) - 1;
      return [...target.slice(0, index), ...inserts, ...target.slice(index)];
    }
  ),
  defineFunction('fn:remove($target as item()*, $position as xs:integer) as item()*', ([target = [], at]) => {
    const index = numberArgument(at) - 1;
    if (index < 0 || index >= target.length) return target;
    return target.toSpliced(index, 1);
  }),
  ...defineWithLast(
    'fn:subsequence($sourceSeq as item()*, $startingLoc as xs:double) as item()*',
    '$length as xs:double',
    ([items = [], start], length) => roundedSlice(items, start, length)
  ),
  ...defineWithCollation(
    'fn:distinct-values($arg as xs:anyAtomicType*) as xs:anyAtomicType*',
    ([items = []], context, collation) => distinctValues(items, collation, context)
  ),
  ...defineWithCollation(
    'fn:index-of($seq as xs:anyAtomicType*, $search as xs:anyAtomicType) as xs:integer*',
    ([items = [], search], context, collation) =>
      indexOf(items, onlyItem<XdmAtomicValue>(search), comparisonWith(context, collation))
  ),
  ...defineWithCollation(
    'fn:deep-equal($parameter1 as item()*, $parameter2 as item()*) as xs:boolean',
    ([first = [], second = []], context, collation) =>
      booleanResult(deepEqual(first, second, comparisonWith(context, collation)))
  ),
  defineLazyFunction(ITEMS_THAT_TELL_SEVERAL, 'fn:zero-or-one($arg as item()*) as item()?', ([items = []]) =>
    items.length <= 1
      ? items
      : dynamicError(XPathErrorCode.MORE_THAN_ONE_ITEM, 'zero-or-one() was given more than one item')
  ),
  defineFunction('fn:one-or-more($arg as item()*) as item()+', ([items = []]) =>
    items.length > 0
      ? items
      : dynamicError(XPathErrorCode.EMPTY_SEQUENCE_GIVEN, 'one-or-more() was given the empty sequence')
  ),
  defineLazyFunction(ITEMS_THAT_TELL_SEVERAL, 'fn:exactly-one($arg as item()*) as item()', ([items = []]) => {
    if (items.length === 1) return items;
    const given = items.length === 0 ? 'the empty sequence' : 'more than one item';
    return dynamicError(XPathErrorCode.NOT_EXACTLY_ONE, `exactly-one() was given ${given}`);
  }),
];
