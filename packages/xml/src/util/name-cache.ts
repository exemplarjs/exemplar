/** How many names a `NameCache` holds: a power of two, so that masking picks a place. */
const CAPACITY = 1024;
const PLACE_MASK = CAPACITY - 1;
/** The places of a `NameCache` that holds no name yet. */
const NO_NAMES: readonly string[] = Array.from({ length: CAPACITY }, () => '');
/** What each part of a name's place is multiplied by before the next is added, to spread names over the places. */
const SPREAD = 31;

/** The place of a name that is not empty, from its length and its first, middle and last characters. */
function placeOf(name: string): number {
  const length = name.length;
  const ends = name.charCodeAt(0) * SPREAD + name.charCodeAt(length - 1);
  return ((ends * SPREAD + name.charCodeAt(length >> 1)) * SPREAD + length) & PLACE_MASK;
}

/**
 * A cache of the names a check has passed, so that a document's repeated names are checked once.
 * It is direct-mapped: a name has one place, picked by its length and three of its characters, and
 * a name that picks a taken place replaces the one there. Finding a name takes no hashing, which a
 * map would do for every name a parser hands over, as each is a new string.
 *
 * ```ts
 * const valid = new NameCache();
 * valid.has('title'); // false
 * valid.add('title');
 * valid.has('title'); // true
 * ```
 */
export class NameCache {
  /** The names, each at its place; made when the first is added, as a cache that is never used costs nothing. */
  #names: string[] | undefined;

  /** Whether the cache holds a name. */
  has(name: string): boolean {
    const names = this.#names;
    return names !== undefined && name !== '' && names[placeOf(name)] === name;
  }

  /** Holds a name, which must not be empty, in place of any other at its place. */
  add(name: string): void {
    this.#names ??= NO_NAMES.slice();
    this.#names[placeOf(name)] = name;
  }
}
