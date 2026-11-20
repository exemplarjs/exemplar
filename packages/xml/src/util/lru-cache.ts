/** What `LruCache` holds as its latest key before any key is used. */
const NO_KEY = Symbol('no key');

/**
 * A cache of up to `capacity` entries that drops the least recently used one to make room, as a
 * Java `LinkedHashMap` in access order does. It belongs to whatever makes it, and goes when that does.
 *
 * ```ts
 * const lengths = new LruCache<string, number>(2);
 * lengths.computeIfAbsent('abc', (text) => text.length); // 3, computed
 * lengths.computeIfAbsent('abc', (text) => text.length); // 3, from the cache
 * lengths.computeIfAbsent('de', (text) => text.length);
 * lengths.computeIfAbsent('f', (text) => text.length); // drops 'abc', the one used longest ago
 * ```
 */
export class LruCache<Key, Value> {
  /** The entries, the least recently used first, as a `Map` keeps the order its keys were added in. */
  readonly #entries = new Map<Key, Value>();
  readonly #capacity: number;
  /** The key used last and its value, found without a lookup when the key is used again. */
  #latest: Key | typeof NO_KEY = NO_KEY;
  #latestValue: Value | undefined;

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  /**
   * The value held for a key, or the one `compute` gives for it, which is then held. A value of
   * `undefined` is held like any other; an error `compute` throws is not.
   */
  computeIfAbsent(key: Key, compute: (key: Key) => Value): Value {
    if (key === this.#latest) return this.#latestValue as Value;
    const entries = this.#entries;
    let value = entries.get(key);
    if (value === undefined && !entries.has(key)) {
      value = compute(key);
      // The entry used longest ago is the first.
      if (entries.size >= this.#capacity) entries.delete(entries.keys().next().value as Key);
    } else {
      entries.delete(key);
    }
    // Added last, the entry is the most recently used.
    entries.set(key, value as Value);
    this.#latest = key;
    this.#latestValue = value;
    return value as Value;
  }
}
