/** How many results are kept, by default, before the oldest is dropped. */
const DEFAULT_LIMIT = 100;

/**
 * Results kept by string key, up to `limit` of them, the first computed dropped first; an error
 * thrown while computing is not kept. The results must not be changed.
 */
export class RememberedResults<Result> {
  readonly #kept = new Map<string, Result>();
  readonly #limit: number;

  constructor(limit = DEFAULT_LIMIT) {
    this.#limit = limit;
  }

  /** The result kept for a key, or the one `compute` gives, which is then kept. */
  get(key: string, compute: () => Result): Result {
    let result = this.#kept.get(key);
    if (result === undefined) {
      result = compute();
      if (this.#kept.size >= this.#limit) this.#kept.delete(this.#kept.keys().next().value as string);
      this.#kept.set(key, result);
    }
    return result;
  }
}

/** A function of a string that keeps its last `limit` results, as {@link RememberedResults} does. */
export function remembered<Result>(compute: (text: string) => Result, limit = DEFAULT_LIMIT): (text: string) => Result {
  const results = new RememberedResults<Result>(limit);
  return (text) => results.get(text, () => compute(text));
}
