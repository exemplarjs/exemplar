/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { AsyncReaderRequiredError, XMLInputFactory } from '@/index';

/** The rejections nothing handled while `run` ran and the turns after it. */
async function unhandledDuring(run: () => void): Promise<unknown[]> {
  const unhandled: unknown[] = [];
  const note = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', note);
  try {
    run();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', note);
  }
  return unhandled;
}

describe('a resolver that answers a synchronous reader with a promise', () => {
  it('is refused, and its promise is not left to reject unhandled', async () => {
    const entityResolver = { resolveEntity: () => Promise.reject(new Error('the fetch failed')) };
    const factory = new XMLInputFactory({ entityResolver, accessExternalDTD: 'all' });
    const unhandled = await unhandledDuring(() => {
      const reader = factory.createStreamReader('<!DOCTYPE a SYSTEM "a.dtd"><a/>');
      expect(() => reader.next()).toThrow(AsyncReaderRequiredError);
    });
    expect(unhandled).toEqual([]);
  });
});
