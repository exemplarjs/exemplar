import { type EntityResolver, EventType } from '@exemplarjs/xml';
import type { Validator } from '@exemplarjs/xml/internal';

/** A resolver that reads entities from a map of system ids to text, as if from below `base`. */
export function resolver(files: Readonly<Record<string, string>>, base = 'file:///ext/'): EntityResolver {
  return {
    resolveEntity: ({ systemId }) => {
      const text = systemId === undefined ? undefined : files[systemId];
      if (text === undefined) return undefined;
      return { systemId: new URL(systemId as string, base).href, bytes: new TextEncoder().encode(text) };
    },
  };
}

/** A validator that reports all whitespace character data as whitespace in element content (SPACE). */
export const spaceValidator: Validator = {
  create: (context) => ({
    dtd: () => undefined,
    startElement: () => undefined,
    endElement: () => undefined,
    text: (event) => event === EventType.CHARACTERS && context.reader.isWhitespace(),
    markup: () => undefined,
    entity: () => undefined,
    endDocument: () => undefined,
  }),
};

/** A stream of a string's UTF-8 bytes, in chunks of `size` bytes. */
export function streamOf(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}
