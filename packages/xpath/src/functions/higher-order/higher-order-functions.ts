import {
  EMPTY_SEQUENCE,
  type XdmArray,
  XdmAtomicValue,
  type XdmFunction,
  type XdmItem,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import type { QName } from '@exemplarjs/xml';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { integerResult, isTrue, numberArgument, onlyItem } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { callFunction } from '@/runtime/function-items';
import { namedFunction } from '@/runtime/named-functions';
import { after, inTurn, joinedInTurn, keptInTurn, type Pausable } from '@/runtime/pausing';
import { defineSorts } from './sort-keys.ts';

/** Each item of a sequence as a value of its own, as the functions on sequences pass items to function items. */
function singletons(items: XdmValue): XdmValue[] {
  return items.map((item) => [item]);
}

/** The function applied to each value in turn, a result for each. */
export function applyToEach(values: readonly XdmValue[], action: XdmFunction): Pausable<XdmValue[]> {
  return inTurn(values.length, (index) => callFunction(action, [values[index] as XdmValue]));
}

/** The values for which a predicate is true. */
export function keepWhere(values: readonly XdmValue[], predicate: XdmFunction): Pausable<XdmValue[]> {
  return after(applyToEach(values, predicate), (results) =>
    values.filter((_, index) => isTrue(results[index] as XdmValue))
  );
}

/** The function applied to the result so far and each value, from the first; from `right`, to each value and the result, from the last. */
export function fold(
  values: readonly XdmValue[],
  zero: XdmValue,
  action: XdmFunction,
  from: 'left' | 'right'
): Pausable<XdmValue> {
  const ordered = from === 'left' ? values : values.toReversed();
  const foldFrom = (start: number, result: XdmValue): Pausable<XdmValue> => {
    for (let index = start; index < ordered.length; index++) {
      const value = ordered[index] as XdmValue;
      const next = callFunction(action, from === 'left' ? [result, value] : [value, result]);
      if (next instanceof Promise) return next.then((awaited) => foldFrom(index + 1, awaited));
      result = next;
    }
    return result;
  };
  return foldFrom(0, zero);
}

/** The function applied to the values at each position of both lists, as far as the shorter goes. */
export function applyToPairs(
  first: readonly XdmValue[],
  second: readonly XdmValue[],
  action: XdmFunction
): Pausable<XdmValue[]> {
  const count = Math.min(first.length, second.length);
  return inTurn(count, (index) => callFunction(action, [first[index] as XdmValue, second[index] as XdmValue]));
}

/** `fn:apply`: the function called with the members of an array as its arguments; FOAP0001 when they are not as many as its arity. */
function apply(action: XdmFunction, argumentArray: XdmArray): Pausable<XdmValue> {
  const members = argumentArray.members;
  if (members.length !== action.arity)
    return dynamicError(
      XPathErrorCode.WRONG_ARGUMENT_COUNT,
      `apply() was given ${members.length} arguments for a function of arity ${action.arity}`
    );
  return callFunction(action, members);
}

/** The higher-order functions (F&O §16): on function items, and those that take functions as arguments. */
export const HIGHER_ORDER_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction(
    'fn:function-lookup($name as xs:QName, $arity as xs:integer) as function(*)?',
    ([name, arity], context) => {
      const qname = onlyItem<XdmAtomicValue>(name).value as QName;
      const staticContext = context.environment.staticContext;
      const make = namedFunction(qname.namespaceURI, qname.localName, numberArgument(arity), staticContext);
      return make === undefined ? EMPTY_SEQUENCE : [make(context)];
    }
  ),
  defineFunction('fn:function-name($func as function(*)) as xs:QName?', ([func]) => {
    const name = onlyItem<XdmFunction>(func).name;
    return name === undefined ? EMPTY_SEQUENCE : [new XdmAtomicValue(XS.QName, name)];
  }),
  defineFunction('fn:function-arity($func as function(*)) as xs:integer', ([func]) =>
    integerResult(onlyItem<XdmFunction>(func).arity)
  ),
  defineFunction(
    'fn:for-each($seq as item()*, $action as function(item()) as item()*) as item()*',
    ([items = [], action]) => {
      const each = onlyItem<XdmFunction>(action);
      return joinedInTurn(items.length, (index) => callFunction(each, [[items[index] as XdmItem]]));
    }
  ),
  defineFunction(
    'fn:filter($seq as item()*, $f as function(item()) as xs:boolean) as item()*',
    ([items = [], predicate]) => {
      const test = onlyItem<XdmFunction>(predicate);
      return keptInTurn(items, (index) => after(callFunction(test, [[items[index] as XdmItem]]), isTrue));
    }
  ),
  defineFunction(
    'fn:fold-left($seq as item()*, $zero as item()*, $f as function(item()*, item()) as item()*) as item()*',
    ([items = [], zero = [], action]) => fold(singletons(items), zero, onlyItem(action), 'left')
  ),
  defineFunction(
    'fn:fold-right($seq as item()*, $zero as item()*, $f as function(item(), item()*) as item()*) as item()*',
    ([items = [], zero = [], action]) => fold(singletons(items), zero, onlyItem(action), 'right')
  ),
  defineFunction(
    'fn:for-each-pair($seq1 as item()*, $seq2 as item()*, $action as function(item(), item()) as item()*) as item()*',
    ([first = [], second = [], action]) => {
      const each = onlyItem<XdmFunction>(action);
      const count = Math.min(first.length, second.length);
      return joinedInTurn(count, (index) =>
        callFunction(each, [[first[index] as XdmItem], [second[index] as XdmItem]])
      );
    }
  ),
  defineFunction('fn:apply($function as function(*), $array as array(*)) as item()*', ([action, array]) =>
    apply(onlyItem(action), onlyItem(array))
  ),
  ...defineSorts(
    'fn:sort($input as item()*) as item()*',
    'function(item()) as xs:anyAtomicType*',
    (items = []) => singletons(items),
    (sorted) => sorted.flat()
  ),
];
