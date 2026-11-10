import { isNode, type XdmItem, type XdmValue } from '@exemplarjs/xdm';
import { effectiveBooleanValue } from './boolean-value.ts';
import type { DynamicContext, Evaluator } from './dynamic-context.ts';

/**
 * A value's items handed out one at a time, as a consumer asks for them, so that one needing only the
 * first, as `exists` does, stops there. A stream that can count its items without making them, as one of
 * node numbers can, offers `count`, which reads the stream to its end.
 *
 * ```ts
 * const stream = streamOf(evaluator)(context);
 * firstItems(stream, 1); // the first item, or none, and nothing after it is evaluated
 * ```
 */
export interface ItemStream {
  next(): XdmItem | undefined;
  count?(): number;
}

/** A compiled expression's stream form: a function from the dynamic context to its items as a stream. */
export type Streamer = (context: DynamicContext) => ItemStream;

/** The key under which an evaluator holds the maker of its stream form; a property is quicker to set than a weak map's entry. */
const STREAM = Symbol('stream');

/** An evaluator that may hold the maker of a stream form, made only when a consumer asks for it. */
type StreamingEvaluator = Evaluator & { [STREAM]?: () => Streamer };

/** Gives an evaluator a stream form, made when first asked for, which must give the evaluator's items in its order; returns the evaluator. */
export function withStream(evaluator: Evaluator, make: () => Streamer): Evaluator {
  (evaluator as StreamingEvaluator)[STREAM] = make;
  return evaluator;
}

/** An evaluator's stream form, or a stream over the value it evaluates to; for an evaluator that cannot pause. */
export function streamOf(evaluator: Evaluator): Streamer {
  const make = (evaluator as StreamingEvaluator)[STREAM];
  return make === undefined ? (context) => new ArrayStream(evaluator(context)) : make();
}

/** Whether an evaluator has a stream form of its own, which reads less than its whole value. */
export function hasStream(evaluator: Evaluator): evaluator is StreamingEvaluator {
  return (evaluator as StreamingEvaluator)[STREAM] !== undefined;
}

/** A reader of an evaluator's first items, up to a limit: from its stream, or else its whole value, which has them. */
export function firstItemsReader(evaluator: Evaluator, limit: number): Evaluator {
  if (!hasStream(evaluator)) return evaluator;
  const items = streamOf(evaluator);
  return (context) => firstItems(items(context), limit);
}

/** A reader of how many items an evaluator gives: counted from its stream, or else its value's length. */
export function countReader(evaluator: Evaluator): (context: DynamicContext) => number {
  if (!hasStream(evaluator)) return (context) => evaluator(context).length;
  const items = streamOf(evaluator);
  return (context) => countItems(items(context));
}

/** A reader of an evaluator's effective boolean value: from as few of its stream's items as decide it, or else its value. */
export function truthReader(evaluator: Evaluator): (context: DynamicContext) => boolean {
  if (!hasStream(evaluator)) return (context) => effectiveBooleanValue(evaluator(context));
  const items = streamOf(evaluator);
  return (context) => truthOf(items(context));
}

/** A value's items, from an index. */
export class ArrayStream implements ItemStream {
  readonly #items: XdmValue;
  #index = 0;

  constructor(items: XdmValue) {
    this.#items = items;
  }

  next(): XdmItem | undefined {
    return this.#items[this.#index++];
  }

  count(): number {
    const left = this.#items.length - this.#index;
    this.#index = this.#items.length;
    return Math.max(left, 0);
  }
}

/** Up to the first `limit` items of a stream, reading no further. */
function firstItems(stream: ItemStream, limit: number): XdmItem[] {
  const items: XdmItem[] = [];
  while (items.length < limit) {
    const item = stream.next();
    if (item === undefined) break;
    items.push(item);
  }
  return items;
}

/** How many items a stream holds, counted without keeping them. */
function countItems(stream: ItemStream): number {
  if (stream.count !== undefined) return stream.count();
  let count = 0;
  while (stream.next() !== undefined) count++;
  return count;
}

/** The items of several streams, one after another, each stream made only when the one before runs out: a sequence's items. */
export class JoinedStream implements ItemStream {
  readonly #streamers: readonly Streamer[];
  readonly #context: DynamicContext;
  #index = 0;
  #stream: ItemStream | undefined;

  constructor(streamers: readonly Streamer[], context: DynamicContext) {
    this.#streamers = streamers;
    this.#context = context;
  }

  next(): XdmItem | undefined {
    for (;;) {
      const item = this.#stream?.next();
      if (item !== undefined) return item;
      const streamer = this.#streamers[this.#index++];
      if (streamer === undefined) return undefined;
      this.#stream = streamer(this.#context);
    }
  }
}

/** The items of a stream, all of them, in a list. */
export function allItems(stream: ItemStream): XdmItem[] {
  const items: XdmItem[] = [];
  for (let item = stream.next(); item !== undefined; item = stream.next()) items.push(item);
  return items;
}

/** The effective boolean value of a stream's items, which a first node, or two items, decide. */
function truthOf(stream: ItemStream): boolean {
  const first = stream.next();
  if (first === undefined) return false;
  if (isNode(first)) return true;
  const second = stream.next();
  return effectiveBooleanValue(second === undefined ? [first] : [first, second]);
}
