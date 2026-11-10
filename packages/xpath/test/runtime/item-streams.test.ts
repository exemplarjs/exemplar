import { describe, expect, it } from 'vitest';
import { XdmAtomicValue, type XdmValue } from '@exemplarjs/xdm';
import { DynamicContext, type Evaluator } from '@/runtime/dynamic-context';
import {
  allItems,
  ArrayStream,
  countReader,
  firstItemsReader,
  hasStream,
  JoinedStream,
  type Streamer,
  streamOf,
  truthReader,
  withStream,
} from '@/runtime/item-streams';
import { LIBRARY } from '../helpers/evaluate.ts';

const one = XdmAtomicValue.integer(1);
const two = XdmAtomicValue.integer(2);
const context = new DynamicContext(undefined, 0, 0, [], undefined as never);

/** An evaluator of a value that counts how often it is evaluated. */
function counted(value: XdmValue): Evaluator & { calls: number } {
  const evaluator = Object.assign(
    () => {
      evaluator.calls++;
      return value;
    },
    { calls: 0 }
  );
  return evaluator;
}

describe('array streams', () => {
  it('give their items, then count what is left', () => {
    const stream = new ArrayStream([one, two]);
    expect(stream.next()).toBe(one);
    expect(stream.count()).toBe(1);
    expect([stream.next(), stream.count()]).toEqual([undefined, 0]);
  });
});

describe('joined streams', () => {
  it('make each stream only when the one before runs out', () => {
    const later = counted([two]);
    const streamers: Streamer[] = [() => new ArrayStream([one]), streamOf(later)];
    const stream = new JoinedStream(streamers, context);
    expect(stream.next()).toBe(one);
    expect(later.calls).toBe(0);
    expect(allItems(stream)).toEqual([two]);
    expect(later.calls).toBe(1);
  });
});

describe('stream forms', () => {
  it('belong to the evaluators given them, others reading their values', () => {
    const plain: Evaluator = () => [one, two];
    const streaming = withStream(
      () => [one, two],
      () => () => new ArrayStream([one])
    );
    expect([hasStream(plain), hasStream(streaming)]).toEqual([false, true]);
    expect(allItems(streamOf(plain)(context))).toEqual([one, two]);
    expect(allItems(streamOf(streaming)(context))).toEqual([one]);
  });

  it('read first items, counts and truth from a stream when there is one, else from the value', () => {
    const plain: Evaluator = () => [one, two];
    const streaming = withStream(
      () => [one, two],
      () => () => new ArrayStream([LIBRARY, one])
    );
    expect([firstItemsReader(plain, 1)(context), firstItemsReader(streaming, 1)(context)]).toEqual([
      [one, two],
      [LIBRARY],
    ]);
    expect([countReader(plain)(context), countReader(streaming)(context)]).toEqual([2, 2]);
    expect(truthReader(streaming)(context)).toBe(true);
    const counting = withStream(
      () => [one],
      () => () => ({ next: () => undefined })
    );
    expect(countReader(counting)(context)).toBe(0);
  });

  it('take truth from one atomic value, and refuse more than one', () => {
    const single = withStream(
      () => [one],
      () => () => new ArrayStream([one])
    );
    const several = withStream(
      () => [one, two],
      () => () => new ArrayStream([one, two])
    );
    expect([
      truthReader(single)(context),
      truthReader(
        withStream(
          () => [],
          () => () => new ArrayStream([])
        )
      )(context),
    ]).toEqual([true, false]);
    expect(() => truthReader(several)(context)).toThrow('FORG0006');
  });
});
