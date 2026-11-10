import { describe, expect, it } from 'vitest';
import { isEvaluationSignal, ResourcePool } from '@/runtime/resources';
import { resolverOf } from '../helpers/resources.ts';

const WAITS = true;
const ANSWERS_AT_ONCE = false;

describe('ResourcePool', () => {
  it('asks a question once per key, remembering its value or its error', () => {
    const pool = new ResourcePool(undefined, ANSWERS_AT_ONCE);
    let asked = 0;
    expect(pool.answer('a', () => ++asked)).toBe(1);
    expect(pool.answer('a', () => ++asked)).toBe(1);
    const failure = new Error('no');
    const fail = (): never => {
      asked++;
      throw failure;
    };
    expect(() => pool.answer('b', fail)).toThrow(failure);
    expect(() => pool.answer('b', fail)).toThrow(failure);
    expect(asked).toBe(2);
  });

  it('raises a TypeError for a promise when it does not wait, which an evaluation passes on', () => {
    const pool = new ResourcePool(undefined, ANSWERS_AT_ONCE);
    let error: unknown;
    try {
      void pool.answer('a', () => Promise.reject(new Error('ignored')));
    } catch (error_) {
      error = error_;
    }
    expect(error).toBeInstanceOf(TypeError);
    expect(isEvaluationSignal(error)).toBe(true);
    expect(isEvaluationSignal(new TypeError('other'))).toBe(false);
  });

  it('gives the promise when it waits, the same one while it is pending, and the answer once settled', async () => {
    const pool = new ResourcePool(undefined, WAITS);
    const later = pool.answer('a', () => Promise.resolve('later'));
    const failed = pool.answer('b', () => Promise.reject(new Error('failed')));
    expect(pool.answer('a', () => 'asked again')).toBe(later);
    await expect(later).resolves.toBe('later');
    await expect(failed).rejects.toThrow('failed');
    expect(pool.answer('a', () => 'unused')).toBe('later');
    expect(() => pool.answer('b', () => 'unused')).toThrow('failed');
  });

  it('gives what the URI resolver supplies, a stream read to its bytes', async () => {
    const stream = new Blob(['<a/>']).stream();
    const pool = new ResourcePool({ uriResolver: resolverOf({ 'u:text': '<t/>', 'u:stream': { stream } }) }, WAITS);
    expect(pool.source('u:text')).toEqual({ text: '<t/>' });
    await expect(pool.source('u:stream')).resolves.toEqual({ bytes: new TextEncoder().encode('<a/>') });
    expect(pool.source('u:stream')).toEqual({ bytes: new TextEncoder().encode('<a/>') });
    expect(new ResourcePool(undefined, WAITS).source('u:none')).toBeUndefined();
  });

  it('asks for resources ahead, so that they arrive together, leaving errors for the evaluation', async () => {
    const resolver = resolverOf({ 'u:a': '<a/>' }, true);
    const failing = {
      resolve: () => {
        throw new Error('refused');
      },
    };
    const pool = new ResourcePool({ uriResolver: resolver }, WAITS);
    pool.prefetch(['u:a', 'u:b']);
    expect(resolver.asked).toEqual(['u:a', 'u:b']);
    await expect(pool.source('u:a')).resolves.toEqual({ text: '<a/>' });
    const refusing = new ResourcePool({ uriResolver: failing }, WAITS);
    refusing.prefetch(['u:a']);
    expect(() => refusing.source('u:a')).toThrow('refused');
  });

  it('gives the members of a collection the collection resolver supplies', () => {
    const resolveCollection = (uri: string | undefined) => (uri === undefined ? ['u:default'] : undefined);
    const pool = new ResourcePool({ collectionResolver: { resolveCollection } }, ANSWERS_AT_ONCE);
    expect(pool.collection(undefined)).toEqual(['u:default']);
    expect(pool.collection('u:other')).toBeUndefined();
    expect(new ResourcePool(undefined, ANSWERS_AT_ONCE).collection(undefined)).toBeUndefined();
  });
});
