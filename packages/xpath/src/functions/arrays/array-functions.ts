import { isArray, XdmArray, type XdmItem, type XdmValue } from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { integerResult, numberArgument, onlyItem } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { applyToEach, applyToPairs, fold, keepWhere } from '@/functions/higher-order/higher-order-functions';
import { defineSorts } from '@/functions/higher-order/sort-keys';
import { defineFunction, defineWithLast } from '@/functions/signatures';
import { callFunction, outsideArray } from '@/runtime/function-items';
import { after } from '@/runtime/pausing';

/** A position checked to be from 1 to `last`, the array's size or one past it; FOAY0001 otherwise. */
function checkedPosition(array: XdmArray, value: XdmValue | undefined, last: number): number {
  const position = numberArgument(value);
  if (position < 1 || position > last) return outsideArray(position, array.size);
  return position;
}

/** An array as one value: the array itself as its only item. */
function arrayResult(members: readonly XdmValue[]): XdmValue {
  return [XdmArray.of(members)];
}

/** The members of an argument of type `array(*)`. */
function membersOf(value: XdmValue | undefined): readonly XdmValue[] {
  return onlyItem<XdmArray>(value).members;
}

/** `array:subarray`: the members from a start, for a length or to the end; FOAY0001 or FOAY0002 for a range outside the array. */
function subarray(array: XdmArray, startValue: XdmValue | undefined, lengthValue: XdmValue | undefined): XdmValue {
  const start = checkedPosition(array, startValue, array.size + 1);
  const length = lengthValue === undefined ? array.size + 1 - start : numberArgument(lengthValue);
  if (length < 0)
    return dynamicError(XPathErrorCode.NEGATIVE_ARRAY_LENGTH, `array:subarray() was given the length ${length}`);
  if (start + length > array.size + 1) return outsideArray(start + length - 1, array.size);
  return arrayResult(array.members.slice(start - 1, start - 1 + length));
}

/** `array:remove`: the array without the members at some positions; FOAY0001 for a position outside it. */
function remove(array: XdmArray, positions: XdmValue): XdmValue {
  const removed = new Set(positions.map((position) => checkedPosition(array, [position], array.size)));
  return arrayResult(array.members.filter((_, index) => !removed.has(index + 1)));
}

/** The first member of an array, or the rest; FOAY0001 for an empty array. */
function headOrTail(array: XdmArray, part: 'head' | 'tail'): XdmValue {
  if (array.size === 0)
    return dynamicError(XPathErrorCode.ARRAY_INDEX_OUT_OF_BOUNDS, `array:${part}() was given an empty array`);
  return part === 'head' ? (array.members[0] as XdmValue) : arrayResult(array.members.slice(1));
}

/** `array:flatten`: the items, with every array replaced by its members, flattened in turn. */
export function flatten(items: XdmValue): XdmItem[] {
  return items.flatMap((item) => (isArray(item) ? item.members.flatMap((member) => flatten(member)) : [item]));
}

/** The functions on arrays (F&O §17.3), in the `array` namespace. */
export const ARRAY_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('array:size($array as array(*)) as xs:integer', ([array]) =>
    integerResult(onlyItem<XdmArray>(array).size)
  ),
  defineFunction('array:get($array as array(*), $position as xs:integer) as item()*', ([array, position]) =>
    callFunction(onlyItem(array), [position as XdmValue])
  ),
  defineFunction(
    'array:put($array as array(*), $position as xs:integer, $member as item()*) as array(*)',
    ([array, position, member = []]) => {
      const target = onlyItem<XdmArray>(array);
      return arrayResult(target.members.with(checkedPosition(target, position, target.size) - 1, member));
    }
  ),
  defineFunction('array:append($array as array(*), $appendage as item()*) as array(*)', ([array, appendage = []]) =>
    arrayResult([...membersOf(array), appendage])
  ),
  ...defineWithLast(
    'array:subarray($array as array(*), $start as xs:integer) as array(*)',
    '$length as xs:integer',
    ([array, start], length) => subarray(onlyItem(array), start, length)
  ),
  defineFunction('array:remove($array as array(*), $positions as xs:integer*) as array(*)', ([array, positions = []]) =>
    remove(onlyItem(array), positions)
  ),
  defineFunction(
    'array:insert-before($array as array(*), $position as xs:integer, $member as item()*) as array(*)',
    ([array, position, member = []]) => {
      const target = onlyItem<XdmArray>(array);
      return arrayResult(target.members.toSpliced(checkedPosition(target, position, target.size + 1) - 1, 0, member));
    }
  ),
  defineFunction('array:head($array as array(*)) as item()*', ([array]) => headOrTail(onlyItem(array), 'head')),
  defineFunction('array:tail($array as array(*)) as array(*)', ([array]) => headOrTail(onlyItem(array), 'tail')),
  defineFunction('array:reverse($array as array(*)) as array(*)', ([array]) =>
    arrayResult(membersOf(array).toReversed())
  ),
  defineFunction('array:join($arrays as array(*)*) as array(*)', ([arrays = []]) =>
    arrayResult((arrays as readonly XdmArray[]).flatMap((array) => array.members))
  ),
  defineFunction(
    'array:for-each($array as array(*), $action as function(item()*) as item()*) as array(*)',
    ([array, action]) => after(applyToEach(membersOf(array), onlyItem(action)), arrayResult)
  ),
  defineFunction(
    'array:filter($array as array(*), $function as function(item()*) as xs:boolean) as array(*)',
    ([array, predicate]) => after(keepWhere(membersOf(array), onlyItem(predicate)), arrayResult)
  ),
  defineFunction(
    'array:fold-left($array as array(*), $zero as item()*, $function as function(item()*, item()*) as item()*) as item()*',
    ([array, zero = [], action]) => fold(membersOf(array), zero, onlyItem(action), 'left')
  ),
  defineFunction(
    'array:fold-right($array as array(*), $zero as item()*, $function as function(item()*, item()*) as item()*) as item()*',
    ([array, zero = [], action]) => fold(membersOf(array), zero, onlyItem(action), 'right')
  ),
  defineFunction(
    'array:for-each-pair($array1 as array(*), $array2 as array(*), $function as function(item()*, item()*) as item()*) as array(*)',
    ([first, second, action]) => after(applyToPairs(membersOf(first), membersOf(second), onlyItem(action)), arrayResult)
  ),
  ...defineSorts(
    'array:sort($array as array(*)) as array(*)',
    'function(item()*) as xs:anyAtomicType*',
    membersOf,
    arrayResult
  ),
  defineFunction('array:flatten($input as item()*) as item()*', ([items = []]) => flatten(items)),
];
