import { CREATE_READER } from '@/cursor/internal';
import type { AsyncStreamReader, StreamReader as PublicStreamReader } from '@/cursor/readers';
import { isReader, StreamReader } from '@/cursor/stream-reader';
import type { ErrorHandler } from '@/errors/xml-error';
import { AsyncEventReader, EventReader } from '@/events/event-reader';
import type { XMLEvent } from '@/events/events';
import type { StreamReaderDelegate } from '@/filters/delegate';
import { DecoderRegistry } from '@/input/decoders';
import { openAsyncSource, openSource, type Source } from '@/input/source';
import { type InputOptions, type ResolvedOptions, resolveOptions } from './options.ts';

/**
 * Creates readers that share one configuration, as JAXP's `XMLInputFactory` does. Make one factory
 * with the options a kind of document needs, then a reader per document:
 *
 * ```ts
 * const factory = new XMLInputFactory({ coalescing: true });
 * const reader = factory.createStreamReader('<greeting>Hello</greeting>');
 * while (reader.next() !== EventType.END_DOCUMENT) {
 *   if (reader.eventType() === EventType.CHARACTERS) console.log(reader.text());
 * }
 * ```
 */
export class XMLInputFactory {
  /** @internal */
  readonly options: ResolvedOptions;
  /** The options as given, which `withOptions` starts from. */
  readonly #givenOptions: InputOptions;
  /** The built-in decoders and any the options add. */
  readonly #decoders: DecoderRegistry;
  /** The options with each set of overrides the other reading APIs give, merged once for each. */
  readonly #withOverrides = new WeakMap<Partial<ResolvedOptions>, ResolvedOptions>();

  constructor(options: InputOptions = {}) {
    this.#givenOptions = options;
    this.options = resolveOptions(options);
    this.#decoders = new DecoderRegistry(this.options.decoders);
  }

  /** A factory with the same options but for the ones given. */
  withOptions(overrides: InputOptions): XMLInputFactory {
    return new XMLInputFactory({ ...this.#givenOptions, ...overrides });
  }

  /**
   * Creates a cursor with some resolved options replaced, for the other reading APIs. The merge is cached by the
   * identity of `overrides`, so pass a module-level constant; a per-call `errorHandler` is applied after it.
   * @internal
   */
  [CREATE_READER](
    source: Source | undefined,
    overrides: Partial<ResolvedOptions>,
    async: boolean,
    errorHandler?: ErrorHandler
  ): StreamReader {
    let options = this.#withOverrides.get(overrides);
    if (options === undefined) {
      options = { ...this.options, ...overrides };
      this.#withOverrides.set(overrides, options);
    }
    if (errorHandler !== undefined) options = { ...options, errorHandler };
    return this.#openReader(source, options, async);
  }

  /** Opens a source and returns a cursor over it, or with XInclude on, the XInclude processor's reader. */
  #openReader(source: Source | undefined, options: ResolvedOptions, async: boolean): StreamReader {
    const asyncInput = async ? openAsyncSource(source, this.#decoders) : undefined;
    const opened = asyncInput?.opened ?? openSource(source as Source, this.#decoders);
    if (options.xinclude) return options.xinclude.createReader(source, opened, options, this.#decoders, asyncInput);
    return new StreamReader(opened, options, this.#decoders, asyncInput);
  }

  /** Creates a pull reader over a document. */
  createStreamReader(source: Source): PublicStreamReader {
    return this.#openReader(source, this.options, false) as PublicStreamReader;
  }

  /** Creates an asynchronous pull reader over a stream or any other source, or, without one, a reader to feed. */
  createAsyncStreamReader(source?: Source): AsyncStreamReader {
    return this.#openReader(source, this.options, true);
  }

  /** Creates an event reader over a document, or over a reader: a cursor or a delegate. */
  createEventReader(source: Source | PublicStreamReader | StreamReaderDelegate): EventReader {
    return new EventReader(isReader(source) ? (source as PublicStreamReader) : this.createStreamReader(source));
  }

  /** Creates an asynchronous event reader over a stream, any other source or a reader; without one, it is fed. */
  createAsyncEventReader(
    source?: Source | PublicStreamReader | AsyncStreamReader | StreamReaderDelegate
  ): AsyncEventReader {
    return new AsyncEventReader(
      isReader(source) ? (source as AsyncStreamReader) : this.createAsyncStreamReader(source)
    );
  }

  /** Creates a web stream of a document's events. */
  createEventStream(
    source: Source | PublicStreamReader | AsyncStreamReader | StreamReaderDelegate
  ): ReadableStream<XMLEvent> {
    return this.createAsyncEventReader(source).stream();
  }
}

/** Readers kept for the module's lifetime, so that V8 keeps the hidden classes the optimized parsing code checks for. */
export const RESIDENT_READERS: readonly PublicStreamReader[] = [
  new XMLInputFactory().createStreamReader('<a/>'),
  new XMLInputFactory().createStreamReader(new TextEncoder().encode('<a/>')),
];
