import type { Resolution, ResolvedSource } from '@exemplarjs/xml';
import { abandon, ErrorFactory, readStream } from '@exemplarjs/xml/internal';
import type { CollectionMember, ResourceSettings } from '@/api/evaluation-options';
import { attempt, type Pausable } from './pausing.ts';

/** Raised when a resolver answers with a promise in an evaluation that does not wait for one. */
export class PromiseNotAwaitedError extends TypeError {
  override name = 'PromiseNotAwaitedError';
}

/** Whether an error is the evaluation's own, to pass on as it is rather than raise as an XPath error. */
export function isEvaluationSignal(error: unknown): boolean {
  return error instanceof PromiseNotAwaitedError;
}

/** The TypeError for a promise an evaluation cannot wait for. */
export function promiseNotAwaited(message: string): TypeError {
  return ErrorFactory.create(PromiseNotAwaitedError, message);
}

/** What was found for a key: its value, the error finding it raised, or a promise of either. */
type Answer = { readonly value: unknown } | { readonly error: unknown } | Promise<unknown>;

/**
 * The resources of one evaluation: what the resolvers answered and what was made from it, by key,
 * so that a URI gives the same document or text however often it is read.
 *
 * A resolver may answer with a promise. A pool that waits gives the promise, for the evaluation to
 * pause on, and keeps it, so that every later question for the key waits for the same answer; one
 * that does not raises a `TypeError`.
 *
 * @example
 * const pool = new ResourcePool({ uriResolver }, WAITS);
 * await pool.source('file:///data/a.xml'); // the ResolvedSource
 */
export class ResourcePool {
  readonly settings: ResourceSettings;
  readonly #waits: boolean;
  readonly #answers = new Map<string, Answer>();

  constructor(settings: ResourceSettings | undefined, waits: boolean) {
    this.settings = settings ?? {};
    this.#waits = waits;
  }

  /** What a question gives for a key, asked once: its value, its error raised again, or a promise of either. */
  answer<Value>(key: string, question: () => Pausable<Value>): Pausable<Value> {
    const known = this.#answers.get(key);
    if (known instanceof Promise) return known as Promise<Value>;
    if (known !== undefined) {
      if ('error' in known) throw known.error;
      return known.value as Value;
    }
    const answer = attempt(
      () => this.waitFor(question()),
      (value) => {
        this.#answers.set(key, { value });
        return value;
      },
      (error: unknown) => {
        this.#answers.set(key, { error });
        throw error;
      }
    );
    // A promise is kept until it settles, so that every later question for the key waits for it.
    if (answer instanceof Promise) {
      abandon(answer);
      this.#answers.set(key, answer);
    }
    return answer;
  }

  /** A value, or its promise when the pool waits; a TypeError for a promise when it does not. */
  waitFor<Value>(value: Pausable<Value>): Pausable<Value> {
    if (!(value instanceof Promise) || this.#waits) return value;
    abandon(value);
    throw promiseNotAwaited(
      'A resolver answered with a promise, which only evaluateAsync and the other asynchronous methods wait for'
    );
  }

  /** What the URI resolver supplies for an absolute URI, a stream read to its bytes, or undefined. */
  source(uri: string): Pausable<ResolvedSource | undefined> {
    return this.answer(`source ${uri}`, () => withStreamRead(this.settings.uriResolver?.resolve(uri, undefined)));
  }

  /** The members of the collection a URI names, or of the default collection; undefined when none is known. */
  collection(uri: string | undefined): Pausable<readonly CollectionMember[] | undefined> {
    return this.answer(`collection ${uri ?? ''}`, () => this.settings.collectionResolver?.resolveCollection(uri));
  }

  /** Asks for resources ahead of the evaluation, so that their answers arrive together; errors wait for it to raise them. */
  prefetch(uris: readonly string[]): void {
    for (const uri of uris) {
      try {
        const answer = this.source(uri);
        if (answer instanceof Promise) abandon(answer);
      } catch {
        // Remembered: the evaluation meets it in its place.
      }
    }
  }
}

/** A resolver's answer with any stream read to bytes, which needs a promise. */
function withStreamRead(answer: Resolution): ResolvedSource | undefined | Promise<ResolvedSource | undefined> {
  if (answer instanceof Promise) return answer.then((source) => withStreamRead(source));
  if (answer?.stream === undefined) return answer;
  const { stream, ...rest } = answer;
  return readStream(stream).then((bytes) => ({ ...rest, bytes }));
}
