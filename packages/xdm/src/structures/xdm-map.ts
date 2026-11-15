import type { QName } from '@exemplarjs/xml';
import { sameKeyOf } from '@/compare/same-key';
import type { XdmAtomicValue } from '@/values/atomic-value';
import type { XdmValue } from '@/values/item';
import { XdmFunction } from './xdm-function.ts';

/** One entry of a map: its key and its value. */
export type MapEntry = readonly [key: XdmAtomicValue, value: XdmValue];

/** What to make of a key given twice when building a map: the entry to keep, from the one there and the one added. */
export type DuplicateKeys = (existing: MapEntry, added: MapEntry) => MapEntry;

/** A later entry replaces an earlier one. */
const LAST_WINS: DuplicateKeys = (_existing, added) => added;

/**
 * A map: entries from atomic keys to values, immutable. Keys are compared as `op:same-key`
 * compares them, so `1`, `1.0` and `1e0` are one key, and so are a string and an untyped value
 * with the same text.
 *
 * ```ts
 * const prices = XdmMap.of([[XdmAtomicValue.string('tea'), [XdmAtomicValue.integer(3n)]]]);
 * prices.get(XdmAtomicValue.untypedAtomic('tea')); // [3]
 * prices.put(XdmAtomicValue.string('cake'), [XdmAtomicValue.integer(5n)]).size; // 2
 * ```
 *
 * As a function, a map takes a key and returns its value, or the empty sequence. Entries keep the
 * order they were added in, which XPath leaves to the implementation.
 */
export class XdmMap extends XdmFunction {
  /** The empty map, shared. */
  static readonly EMPTY: XdmMap = new XdmMap(new Map());

  readonly #entries: ReadonlyMap<string, MapEntry>;

  private constructor(entries: ReadonlyMap<string, MapEntry>) {
    super();
    this.#entries = entries;
  }

  /** A map of entries; a key given twice keeps the entry `duplicates` chooses, by default the later one. */
  static of(entries: Iterable<MapEntry>, duplicates: DuplicateKeys = LAST_WINS): XdmMap {
    const built = new Map<string, MapEntry>();
    for (const entry of entries) {
      const sameKey = sameKeyOf(entry[0]);
      const existing = built.get(sameKey);
      built.set(sameKey, existing === undefined ? entry : duplicates(existing, entry));
    }
    return built.size === 0 ? XdmMap.EMPTY : new XdmMap(built);
  }

  get name(): QName | undefined {
    return undefined;
  }

  get arity(): number {
    return 1;
  }

  /** How many entries the map has. */
  get size(): number {
    return this.#entries.size;
  }

  /** The value of a key, or undefined when the map has no such key. */
  get(key: XdmAtomicValue): XdmValue | undefined {
    return this.#entries.get(sameKeyOf(key))?.[1];
  }

  /** Whether the map has a key. */
  has(key: XdmAtomicValue): boolean {
    return this.#entries.has(sameKeyOf(key));
  }

  /** The keys, in the order they were added. */
  keys(): XdmAtomicValue[] {
    return [...this.#entries.values()].map(([key]) => key);
  }

  /** The entries, in the order they were added. */
  entries(): IterableIterator<MapEntry> {
    return this.#entries.values();
  }

  /** A map with one more entry, replacing any entry of the same key. */
  put(key: XdmAtomicValue, value: XdmValue): XdmMap {
    const entries = new Map(this.#entries);
    const sameKey = sameKeyOf(key);
    entries.set(sameKey, [key, value]);
    return new XdmMap(entries);
  }

  /** A map without some keys; keys it does not have are ignored. */
  remove(keys: Iterable<XdmAtomicValue>): XdmMap {
    const entries = new Map(this.#entries);
    for (const key of keys) entries.delete(sameKeyOf(key));
    return entries.size === this.#entries.size ? this : new XdmMap(entries);
  }
}
