import { DecodeError, textBeforeBadBytes, withCarry } from '@/encodings/decoders';
import { ErrorCode } from '@/errors/codes';
import { canonicalEncoding, type Decoder, type DecoderRegistry } from '@/input/decoders';
import { detect, type Detection } from '@/input/detect';
import { grown } from '@/util/arrays';
import { NO_BYTES } from '@/util/bytes';
import { Char } from '@/util/chars';
import { AsyncReaderRequiredError, ErrorFactory, IllegalStateError, InvalidArgumentError } from '@/util/errors';

/** A document given with where it came from. Give its content in exactly one of `text`, `bytes`, `chunks` or `stream`. */
export interface SourceObject {
  /** The document's URI, which locations report and relative references resolve against. */
  readonly systemId?: string;
  readonly publicId?: string;
  /** The URI relative references resolve against, when it differs from `systemId`. */
  readonly baseURI?: string;
  /** An encoding supplied from outside, such as an HTTP charset, which overrides the XML declaration's. */
  readonly encoding?: string;
  /** The document as text, already decoded. */
  readonly text?: string;
  /** The document as bytes, whose encoding is detected. */
  readonly bytes?: Uint8Array;
  /** The document as chunks of bytes, read synchronously. */
  readonly chunks?: Iterable<Uint8Array>;
  /** The document as a stream of bytes, for an asynchronous reader. */
  readonly stream?: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
}

/** Anything exemplar can read a document from. */
export type Source =
  | string
  | Uint8Array
  | Iterable<Uint8Array>
  | AsyncIterable<Uint8Array>
  | ReadableStream<Uint8Array>
  | SourceObject;

/** Returned by an asynchronous text source that has nothing buffered yet. */
export const PENDING: unique symbol = Symbol('pending');

/** A chunk read from a source that may have to wait: the chunk, undefined at the end, or PENDING. */
export type Chunk<T> = T | undefined | typeof PENDING;

/** A document's decoded text, delivered in chunks; the tokenizer reads from one. */
export interface TextSource {
  /** Returns the next chunk, undefined at the end, or PENDING when more input has yet to arrive. */
  read(): Chunk<string>;

  /** What detection found; undefined for text given as a string. */
  readonly detection: Detection | undefined;
}

/** What the tokenizer reads text through: chunks alone. */
export type ChunkSource = Pick<TextSource, 'read'>;

/** Thrown by a text source when the bytes are not legal in their encoding; the valid text before them comes first. */
export class DecodingFailureError extends Error {
  readonly code = ErrorCode.ENCODING_INVALID_BYTES;
  override name = 'DecodingFailureError';
}

/** Thrown when no decoder is registered for the document's encoding. */
export class UnsupportedEncodingError extends Error {
  /** The encoding's canonical name. */
  readonly encoding: string;

  constructor(encoding: string) {
    super(`The encoding ${encoding} is not supported`);
    this.name = 'UnsupportedEncodingError';
    this.encoding = encoding;
  }
}

/** Wraps a text source to report the length of each chunk read and the total so far, which counts an external entity against the limits. */
export class CountedSource implements ChunkSource {
  readonly #source: ChunkSource;
  /** Told the length of each chunk read and the total so far. */
  readonly #onChunk: (size: number, length: number) => void;
  #totalLength = 0;

  constructor(source: ChunkSource, count: (size: number, length: number) => void) {
    this.#source = source;
    this.#onChunk = count;
  }

  read(): Chunk<string> {
    const chunk = this.#source.read();
    if (typeof chunk !== 'string') return chunk;
    this.#totalLength += chunk.length;
    this.#onChunk(chunk.length, this.#totalLength);
    return chunk;
  }
}

/** Text given as one string, delivered as a single chunk. */
class StringSource implements TextSource {
  /** The text, until it has been read. */
  #text: string | undefined;
  readonly detection = undefined;

  constructor(text: string) {
    this.#text = text;
  }

  read(): string | undefined {
    const text = this.#text;
    this.#text = undefined;
    return text;
  }
}

/** A document given as a string, whose leading U+FEFF is skipped as a byte-order mark is. */
function stringDocument(text: string): StringSource {
  // eslint-disable-next-line prefer-code-point -- U+FEFF is one code unit
  return new StringSource(text.charCodeAt(0) === Char.BYTE_ORDER_MARK ? text.slice(1) : text);
}

/** The most bytes of an unfinished character a UTF-8 chunk can end with: one fewer than its longest character takes. */
const MAX_HELD_BYTES = 3;

/** The bytes ending `tail` that start a character not yet complete, which a streaming decoder holds back. */
function heldBytes(tail: Uint8Array): Uint8Array {
  for (let start = 0; start < tail.length; start++) {
    const rest = tail.subarray(start);
    try {
      // Only the start of an unfinished character decodes to nothing; a continuation byte fails.
      if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(rest, { stream: true }) === '') return rest;
    } catch {
      // Not where a character starts.
    }
  }
  return NO_BYTES;
}

/** Byte chunks as a source gives them: a chunk, undefined at the end, or PENDING while the next has yet to arrive. */
interface ByteChunks {
  next(): Chunk<Uint8Array>;
}

/** Byte chunks from a synchronous iterator, which never has to wait. */
function iteratorChunks(iterator: Iterator<Uint8Array>): ByteChunks {
  return {
    next() {
      const result = iterator.next();
      return result.done === true ? undefined : result.value;
    },
  };
}

/** Byte chunks that arrive later: from a stream, as `fill` reads it, or from `feed`. */
export class ChunkQueue implements ByteChunks {
  /** The chunks that have arrived and not been read. */
  readonly #chunks: Uint8Array[] = [];
  /** Whether the input has ended. */
  #ended = false;
  /** Resolves the wait in progress, when a reader is waiting for a chunk. */
  #waiting: (() => void) | undefined;

  /** Adds a chunk. */
  push(chunk: Uint8Array): void {
    if (this.#ended) throw ErrorFactory.create(IllegalStateError, 'Input has already ended');
    this.#chunks.push(chunk);
    this.#wake();
  }

  /** Signals the end of input; false when it had already ended. */
  end(): boolean {
    if (this.#ended) return false;
    this.#ended = true;
    this.#wake();
    return true;
  }

  /** Resolves once a chunk or the end is there to read. */
  wait(): Promise<void> {
    if (this.#chunks.length > 0 || this.#ended) return Promise.resolve();
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  /** Resolves the wait in progress, if there is one. */
  #wake(): void {
    const waiting = this.#waiting;
    this.#waiting = undefined;
    waiting?.();
  }

  next(): Chunk<Uint8Array> {
    const chunk = this.#chunks.shift();
    if (chunk !== undefined) return chunk;
    return this.#ended ? undefined : PENDING;
  }
}

/**
 * A document given as bytes, decoded chunk by chunk. It reads the first bytes until it can tell the
 * encoding (from a byte-order mark, the way the first characters are written, or the XML
 * declaration), then decodes those and every later chunk with that encoding's decoder.
 *
 * Bytes the encoding doesn't allow fail the document, but not at once: the valid text before them
 * is returned first, so the error comes at the right place, and the next read throws.
 */
class ByteSource implements TextSource {
  readonly #chunks: ByteChunks;
  readonly #registry: DecoderRegistry;
  readonly #externalEncoding: string | undefined;
  /** The decoder detection chose; undefined until it has. */
  #decoder: Decoder | undefined;
  /** The bytes read before detection decides, in the first `#headLength` of a buffer that doubles as it fills. */
  #head: Uint8Array = NO_BYTES;
  #headLength = 0;
  /** How many of those bytes detection has already searched for the end of the XML declaration. */
  #bytesSearched = 0;
  /** Whether the byte chunks have ended. */
  #ended = false;
  /** The failure the next read throws, after the valid text before the bad bytes was returned. */
  #pendingFailure: DecodingFailureError | undefined;
  /** For UTF-8, the last bytes decoded, which end with any character the decoder holds until the next chunk completes it. */
  #tail: Uint8Array = NO_BYTES;
  detection: Detection | undefined;

  constructor(chunks: ByteChunks, registry: DecoderRegistry, external: string | undefined) {
    this.#chunks = chunks;
    this.#registry = registry;
    this.#externalEncoding = external;
  }

  read(): Chunk<string> {
    if (this.#pendingFailure) throw this.#pendingFailure;
    if (this.#decoder === undefined) return this.#detectAndDecodeHead();
    if (this.#ended) return undefined;
    const next = this.#chunks.next();
    if (next === PENDING) return PENDING;
    if (next === undefined) this.#ended = true;
    return this.#decode(next);
  }

  /** Reads bytes until detection can decide, then decodes what it has read. */
  #detectAndDecodeHead(): Chunk<string> {
    let detection = this.#detect();
    while (detection === undefined) {
      const next = this.#chunks.next();
      if (next === PENDING) return PENDING;
      if (next === undefined) this.#ended = true;
      else this.#append(next);
      detection = this.#detect();
    }
    this.detection = detection;
    this.#decoder = this.#createDecoder(detection.decoderName);
    const head = this.#head.subarray(detection.byteOrderMarkLength, this.#headLength);
    this.#head = NO_BYTES;
    const text = this.#decode(head);
    if (this.#ended) return text + this.#decode(undefined);
    return text;
  }

  /** Runs detection on the bytes read so far, so that the next run searches only the bytes added since. */
  #detect(): Detection | undefined {
    const head = this.#head.subarray(0, this.#headLength);
    const detection = detect(head, this.#ended, this.#externalEncoding, this.#bytesSearched);
    this.#bytesSearched = head.length;
    return detection;
  }

  /** Copies a chunk after the bytes read before detection, doubling the buffer when it is full. */
  #append(chunk: Uint8Array): void {
    const length = this.#headLength + chunk.length;
    if (length > this.#head.length) this.#head = grown(this.#head, length, this.#headLength);
    this.#head.set(chunk, this.#headLength);
    this.#headLength = length;
  }

  /** A decoder for an encoding, or UnsupportedEncodingError; a runtime may lack one, such as GB18030 with small ICU. */
  #createDecoder(name: string): Decoder {
    const factory = this.#registry.get(name);
    if (factory !== undefined) {
      try {
        return factory();
      } catch {
        // Falls through to the error below.
      }
    }
    throw ErrorFactory.create(UnsupportedEncodingError, name);
  }

  /** Decodes one chunk, or flushes at the end; on bad bytes it returns the valid text and fails on the next read. */
  #decode(chunk: Uint8Array | undefined): string {
    const decoder = this.#decoder as Decoder;
    const isUtf8 = this.detection?.decoderName === 'utf-8';
    try {
      if (chunk === undefined) return decoder.decode();
      const text = decoder.decode(chunk, { stream: true });
      if (isUtf8) {
        const last = chunk.length >= MAX_HELD_BYTES ? chunk : withCarry(this.#tail, chunk);
        this.#tail = last.slice(-MAX_HELD_BYTES);
      }
      return text;
    } catch (error) {
      this.#pendingFailure = ErrorFactory.create(
        DecodingFailureError,
        `The bytes are not legal ${(this.detection as Detection).decoderName}`
      );
      if (error instanceof DecodeError) return error.decoded;
      if (chunk === undefined || !isUtf8) return '';
      // The valid text runs from the bytes the decoder held back.
      const bytes = withCarry(heldBytes(this.#tail), chunk);
      return textBeforeBadBytes(bytes, () => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }));
    }
  }
}

/** A source of chunks of bytes, read synchronously. */
function byteSource(chunks: Iterable<Uint8Array>, registry: DecoderRegistry, external?: string): ByteSource {
  return new ByteSource(iteratorChunks(chunks[Symbol.iterator]()), registry, external);
}

/** Where a source object says it came from. */
function originOf(object: SourceObject): { systemId?: string; publicId?: string; baseURI?: string } {
  return {
    ...(object.systemId !== undefined && { systemId: object.systemId }),
    ...(object.publicId !== undefined && { publicId: object.publicId }),
    ...(object.baseURI !== undefined && { baseURI: object.baseURI }),
  };
}

/** Refuses a source object that gives its content more than once. */
function checkOneContent(object: SourceObject): void {
  const given = [object.text, object.bytes, object.chunks, object.stream].filter((content) => content !== undefined);
  if (given.length > 1)
    throw ErrorFactory.create(
      InvalidArgumentError,
      'A source object has one of text, bytes, chunks or a stream, not several'
    );
}

/** The encoding a source object names, in canonical form. */
function externalEncoding(object: SourceObject): string | undefined {
  return object.encoding === undefined ? undefined : canonicalEncoding(object.encoding);
}

/** Whether a value is an object with a callable property. */
function hasMethod(value: object, name: PropertyKey): boolean {
  return typeof (value as Record<PropertyKey, unknown>)[name] === 'function';
}

/** A source opened for reading: its decoded text, and where it came from. */
export interface OpenedSource {
  readonly text: TextSource;
  readonly systemId?: string;
  readonly publicId?: string;
  readonly baseURI?: string;
}

/** A text source over a string, such as an entity's replacement text. */
export function stringSource(text: string): TextSource {
  return new StringSource(text);
}

/** Opens a source for synchronous reading. */
export function openSource(source: Source, registry: DecoderRegistry): OpenedSource {
  if (typeof source === 'string') return { text: stringDocument(source) };
  if (source instanceof Uint8Array) return { text: byteSource([source], registry) };
  if (hasMethod(source, Symbol.iterator)) return { text: byteSource(source as Iterable<Uint8Array>, registry) };
  if (isStream(source))
    throw ErrorFactory.create(AsyncReaderRequiredError, 'An asynchronous source needs an asynchronous reader');
  const object = source as SourceObject;
  checkOneContent(object);
  const origin = originOf(object);
  const external = externalEncoding(object);
  if (object.text !== undefined) return { ...origin, text: stringDocument(object.text) };
  if (object.bytes !== undefined) return { ...origin, text: byteSource([object.bytes], registry, external) };
  if (object.chunks !== undefined) return { ...origin, text: byteSource(object.chunks, registry, external) };
  if (object.stream !== undefined)
    throw ErrorFactory.create(AsyncReaderRequiredError, 'An asynchronous source needs an asynchronous reader');
  throw ErrorFactory.create(InvalidArgumentError, 'A source object needs text, bytes, chunks or a stream');
}

/** An asynchronous stream of bytes. */
export type ByteStream = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

/** A source opened for the async reader: its text and, unless it was given whole, the queue its chunks arrive in. */
export interface AsyncOpenedSource {
  readonly opened: OpenedSource;
  /** The queue the chunks arrive in; undefined for a source given whole. */
  readonly queue: ChunkQueue | undefined;
  /** Reads the next chunk of a stream into the queue; undefined for a reader that is fed. */
  readonly pump: (() => Promise<void>) | undefined;
}

/** Whether a value is an async iterable or a web stream. */
function isStream(value: unknown): value is ByteStream {
  return (
    typeof value === 'object' &&
    value !== null &&
    (hasMethod(value, Symbol.asyncIterator) || hasMethod(value, 'getReader'))
  );
}

/** Reads a stream's chunks one per call: a chunk, or undefined at the end. */
function chunkReaderOf(stream: ByteStream): () => Promise<Uint8Array | undefined> {
  if (hasMethod(stream, 'getReader')) {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    return async () => {
      const result = await reader.read();
      return result.value;
    };
  }
  const iterator = (stream as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  return async () => {
    const result = await iterator.next();
    return result.done === true ? undefined : result.value;
  };
}

/** Moves a stream's chunks into a queue, one per call. */
function streamPump(stream: ByteStream, queue: ChunkQueue): () => Promise<void> {
  const read = chunkReaderOf(stream);
  return async () => {
    const chunk = await read();
    if (chunk === undefined) queue.end();
    else queue.push(chunk);
  };
}

/** Reads a whole stream into one array. */
export async function readStream(stream: ByteStream): Promise<Uint8Array> {
  const read = chunkReaderOf(stream);
  const chunks: Uint8Array[] = [];
  let length = 0;
  // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
  for (let chunk = await read(); chunk !== undefined; chunk = await read()) {
    chunks.push(chunk);
    length += chunk.length;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Opens a source for the async reader: a stream, anything the sync reader takes, or nothing, to be fed. */
export function openAsyncSource(source: Source | undefined, registry: DecoderRegistry): AsyncOpenedSource {
  if (source === undefined || isStream(source)) {
    const queue = new ChunkQueue();
    const text = new ByteSource(queue, registry, undefined);
    return { opened: { text }, queue, pump: source === undefined ? undefined : streamPump(source, queue) };
  }
  if (!isSourceObject(source) || source.stream === undefined)
    return { opened: openSource(source, registry), queue: undefined, pump: undefined };
  checkOneContent(source);
  const queue = new ChunkQueue();
  const text = new ByteSource(queue, registry, externalEncoding(source));
  return { opened: { ...originOf(source), text }, queue, pump: streamPump(source.stream, queue) };
}

/** The source object a source is; undefined for a string, bytes, an iterable of chunks or a stream. */
export function sourceObjectOf(source: Source | undefined): SourceObject | undefined {
  if (source === undefined || isStream(source) || !isSourceObject(source)) return undefined;
  return source;
}

/** Whether a source that is not a stream is a source object, rather than a string, bytes or an iterable of chunks. */
function isSourceObject(source: Source): source is SourceObject {
  return typeof source === 'object' && !(source instanceof Uint8Array) && !hasMethod(source, Symbol.iterator);
}
