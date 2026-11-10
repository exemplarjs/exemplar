import { XdmAtomicValue, type XdmItem, XdmMap, type XdmValue } from '@exemplarjs/xdm';
import { sameKeyOf } from '@exemplarjs/xdm/internal';
import { Radix } from '@exemplarjs/xml/internal';
import { doubleResult, optionalAtomic } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction, sequenceTypeOf } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { FunctionItem } from '@/runtime/function-items';
import type { FunctionSignature } from '@/static/matchers';

/** The constants of the mulberry32 generator, and of the FNV-1a hash that turns a seed into its first state. */
const STATE_INCREMENT = 0x6d_2b_79_f5;
const SHIFT_FIRST = 15;
const SHIFT_SECOND = 7;
const SHIFT_LAST = 14;
const MIX_ODD = 61;
const STATE_BITS = 32;
const STATES = Radix.BINARY ** STATE_BITS;
const FNV_OFFSET = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

/** The signatures of the generator's `next` and `permute` functions. */
const NEXT_SIGNATURE: FunctionSignature = { parameterTypes: [], returnType: sequenceTypeOf('map(xs:string, item())') };
const PERMUTE_SIGNATURE: FunctionSignature = {
  parameterTypes: [sequenceTypeOf('item()*')],
  returnType: sequenceTypeOf('item()*'),
};

/** One step of the generator: a number from 0 up to 1, and the next state. */
function step(state: number): { number: number; next: number } {
  // States are 32-bit, wrapping as mulberry32's do.
  const next = (state + STATE_INCREMENT) >>> 0;
  let mixed = Math.imul(next ^ (next >>> SHIFT_FIRST), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> SHIFT_SECOND), mixed | MIX_ODD);
  return { number: ((mixed ^ (mixed >>> SHIFT_LAST)) >>> 0) / STATES, next };
}

/** A state from a text, by its FNV-1a hash. */
function hash(text: string): number {
  let state = FNV_OFFSET;
  for (const character of text) state = Math.imul(state ^ (character.codePointAt(0) as number), FNV_PRIME);
  return state >>> 0;
}

/** Items in an order the generator chooses from a state, by the Fisher-Yates shuffle. */
function permute(items: XdmValue, start: number): XdmValue {
  const shuffled = [...items];
  let state = start;
  for (let index = shuffled.length - 1; index > 0; index--) {
    const { number, next } = step(state);
    state = next;
    const other = Math.floor(number * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other] as XdmItem, shuffled[index] as XdmItem];
  }
  return shuffled;
}

/** The generator's map at a state: its `number`, a `next` function giving the map at the next state, and `permute`. */
function generatorAt(state: number): XdmMap {
  const { number, next } = step(state);
  return XdmMap.of([
    [XdmAtomicValue.string('number'), doubleResult(number)],
    [XdmAtomicValue.string('next'), [new FunctionItem(undefined, NEXT_SIGNATURE, () => [generatorAt(next)])]],
    [
      XdmAtomicValue.string('permute'),
      [new FunctionItem(undefined, PERMUTE_SIGNATURE, ([items = []]) => permute(items, next))],
    ],
  ]);
}

/**
 * `fn:random-number-generator`: a seeded, repeatable generator. A seed gives the same numbers
 * every time; without one, the seed is the evaluation's current date and time.
 */
function randomNumberGenerator(seed: XdmValue | undefined, context: DynamicContext): XdmValue {
  const value = optionalAtomic(seed);
  const text = value === undefined ? String(context.environment.currentDateTime.getTime()) : sameKeyOf(value);
  return [generatorAt(hash(text))];
}

/** `fn:random-number-generator`, with and without a seed. */
export const RANDOM_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:random-number-generator() as map(xs:string, item())', (_, context) =>
    randomNumberGenerator(undefined, context)
  ),
  defineFunction(
    'fn:random-number-generator($seed as xs:anyAtomicType?) as map(xs:string, item())',
    ([seed], context) => randomNumberGenerator(seed, context)
  ),
];
