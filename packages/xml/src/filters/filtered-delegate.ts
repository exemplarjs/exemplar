import { EventType } from '@/cursor/event-type';
import type { StreamReader as PublicStreamReader } from '@/cursor/readers';
import type { StreamFilter } from '@/cursor/stream-reader';
import { StreamReaderDelegate } from './delegate.ts';

// Module-level constants, so V8 can inline them; imported bindings are read again on every use.
const { END_DOCUMENT, NEED_INPUT } = EventType;

/**
 * A delegate that reports only the events a filter accepts, as `createFilteredReader` makes over a
 * delegate. The filter sees each event through the delegate below, with any changes it makes.
 */
export class FilteredDelegate extends StreamReaderDelegate {
  readonly #accept: StreamFilter;

  constructor(parent: StreamReaderDelegate, accept: StreamFilter) {
    super(parent);
    this.#accept = accept;
  }

  override next(): EventType {
    for (;;) {
      const type = this.parent.next();
      if (type === NEED_INPUT || type === END_DOCUMENT) return type;
      if (this.#accept(this as unknown as PublicStreamReader)) return type;
    }
  }
}
