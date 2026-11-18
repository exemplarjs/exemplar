import { EventType, type StreamReader, XMLError, type XMLInputFactory } from '@exemplarjs/xml';
import { StreamReaderDelegate } from '@exemplarjs/xml/filters';

/** A delegate that upper-cases text. */
export class UpperCaseText extends StreamReaderDelegate {
  override text(): string {
    return super.text().toUpperCase();
  }
}

/** A cursor over a document, moved to its start tag number `index`, counting from 0. */
export function readerAt(factory: XMLInputFactory, xml: string, index: number): StreamReader {
  const reader = factory.createStreamReader(xml);
  let seen = -1;
  while (reader.next() !== EventType.START_ELEMENT || ++seen < index);
  return reader;
}

/** The XMLError a call throws; fails when it throws nothing or something else. */
export function errorOf(call: () => unknown): XMLError {
  try {
    call();
  } catch (error) {
    if (error instanceof XMLError) return error;
    throw error;
  }
  throw new Error('Expected an XMLError, but nothing was thrown');
}

/** The XMLError an asynchronous call rejects with. */
export async function asyncErrorOf(call: () => Promise<unknown>): Promise<XMLError> {
  try {
    await call();
  } catch (error) {
    if (error instanceof XMLError) return error;
    throw error;
  }
  throw new Error('Expected an XMLError, but nothing was thrown');
}
