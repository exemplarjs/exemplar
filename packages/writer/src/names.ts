import { isNcName } from '@exemplarjs/xml/internal';

/** How many names a `CheckedNames` holds: a power of two, so that masking picks a place. */
const CHECKED_NAMES_LENGTH = 1024;
const PLACE_MASK = CHECKED_NAMES_LENGTH - 1;
/** The places of a `CheckedNames` that has kept no name yet. */
const NO_NAMES: readonly string[] = Array.from({ length: CHECKED_NAMES_LENGTH }, () => '');
/** What each part of a name's place is multiplied by before the next is added, to spread names over the places. */
const SPREAD = 31;

/**
 * The names one writer has found to be XML names without colons, as a document repeats its names.
 * Each is kept at the place its length and its first, middle and last characters pick, so a name is
 * found again without hashing it; a name that picks a taken place replaces the one there.
 *
 * ```ts
 * const names = new CheckedNames();
 * names.isNcName('title'); // true, by the full check
 * names.isNcName('title'); // true, found at its place
 * names.isNcName('a:b'); // false
 * ```
 */
export class CheckedNames {
  readonly #names = NO_NAMES.slice();

  /** Whether a name is an XML name without colons, remembering it when it is. */
  isNcName(name: string): boolean {
    const length = name.length;
    if (length === 0) return false;
    const ends = name.charCodeAt(0) * SPREAD + name.charCodeAt(length - 1);
    const place = ((ends * SPREAD + name.charCodeAt(length >> 1)) * SPREAD + length) & PLACE_MASK;
    if (this.#names[place] === name) return true;
    if (!isNcName(name)) return false;
    this.#names[place] = name;
    return true;
  }
}

/** A qualified name: the local name, after the prefix and a colon when there is one. */
export function qualifiedName(prefix: string, localName: string): string {
  return prefix === '' ? localName : `${prefix}:${localName}`;
}

/** Whether a set of element names holds an element, by qualified name or by expanded name as `{uri}local`. */
export function namesElement(
  names: ReadonlySet<string>,
  qualified: string,
  namespaceURI: string,
  localName: string
): boolean {
  return names.has(qualified) || names.has(`{${namespaceURI}}${localName}`);
}
