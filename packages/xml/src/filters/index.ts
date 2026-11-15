/** @exemplarjs/xml/filters: filtered readers, following StAX's `StreamFilter` and `EventFilter`, and forwarding delegates. */
import { ADD_FILTER } from '@/cursor/internal';
import type { AsyncStreamReader, StreamReader as PublicStreamReader } from '@/cursor/readers';
import { isReader, type StreamFilter } from '@/cursor/stream-reader';
import type { AsyncEventReader, EventFilter, EventReader } from '@/events/event-reader';
import { StreamReaderDelegate } from './delegate.ts';
import { FilteredDelegate } from './filtered-delegate.ts';

export type { StreamFilter } from '@/cursor/stream-reader';
export type { EventFilter } from '@/events/event-reader';
export { StreamReaderDelegate } from './delegate.ts';

/**
 * Makes a reader report only the events its filters accept. They run in the order given, each
 * seeing only the events those before it accepted. Over a cursor, the filters run inside the
 * cursor's own `next()` and the cursor itself is returned; over a delegate, new delegates read
 * through it, so the filters see the delegate's changes.
 */
export function createFilteredReader<T extends PublicStreamReader | AsyncStreamReader>(
  reader: T,
  ...filters: StreamFilter[]
): T;
export function createFilteredReader(reader: StreamReaderDelegate, ...filters: StreamFilter[]): StreamReaderDelegate;
export function createFilteredReader<T extends EventReader | AsyncEventReader>(reader: T, ...filters: EventFilter[]): T;
export function createFilteredReader(
  reader: PublicStreamReader | AsyncStreamReader | StreamReaderDelegate | EventReader | AsyncEventReader,
  ...filters: (StreamFilter | EventFilter)[]
): PublicStreamReader | AsyncStreamReader | StreamReaderDelegate | EventReader | AsyncEventReader {
  let filtered = reader;
  for (const filter of filters) {
    if (filtered instanceof StreamReaderDelegate) filtered = new FilteredDelegate(filtered, filter as StreamFilter);
    else if (isReader(filtered)) filtered[ADD_FILTER](filter as StreamFilter);
    else filtered.addFilter(filter as EventFilter);
  }
  return filtered;
}

/**
 * Stacks delegates on a reader, giving each its parent: the first reads `reader`, and each of the
 * others reads through the one before it. Returns the last, which reports every delegate's changes.
 *
 * ```ts
 * const reader = createDelegatedReader(factory.createStreamReader(source), new Masked(), new Renamed());
 * ```
 */
export function createDelegatedReader(
  reader: PublicStreamReader | AsyncStreamReader | StreamReaderDelegate,
  ...delegates: [StreamReaderDelegate, ...StreamReaderDelegate[]]
): StreamReaderDelegate {
  let parent = reader;
  for (const delegate of delegates) {
    delegate.parent = parent;
    parent = delegate;
  }
  return parent as StreamReaderDelegate;
}
