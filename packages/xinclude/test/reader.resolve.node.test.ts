/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { AsyncReaderRequiredError, EventType, XMLInputFactory } from '@exemplarjs/xml';
import { xincludeProcessor } from '@/index';

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

describe('a resolver that answers a synchronous XInclude reader with a promise', () => {
  it('is refused, and its promise is not left to reject unhandled', async () => {
    const factory = new XMLInputFactory({
      xinclude: xincludeProcessor(),
      accessExternalEntities: 'all',
      uriResolver: { resolve: () => Promise.reject(new Error('the fetch failed')) },
    });
    const main = '<r xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="part.xml"/></r>';
    const unhandled = await unhandledDuring(() => {
      const reader = factory.createStreamReader({ text: main, systemId: 'file:///doc/main.xml' });
      expect(() => {
        while (reader.next() !== EventType.END_DOCUMENT);
      }).toThrow(AsyncReaderRequiredError);
    });
    expect(unhandled).toEqual([]);
  });
});
