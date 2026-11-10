/**
 * Case variants as the `i` flag of XPath regular expressions defines them (F&O 3.1 §5.6.2): a
 * character is a case variant of another when their lower cases, or their upper cases, are the
 * same, as `toLowerCase` and `toUpperCase` map them. So `k`, `K` and the Kelvin sign U+212A are
 * all variants of each other, and so are `i`, `I` and the dotless `ı` (U+0131), which all
 * upper-case to `I`.
 *
 * The table is built on first use, by mapping every character of planes 0 and 1 once.
 */

import { isSurrogate } from './chars.ts';

/** The last code point of plane 1: no character beyond it has a case mapping. */
const LAST_CASED = 0x1_ff_ff;

/** Each character that has case variants, with them, and those characters in order so a range can find its own. */
interface VariantTable {
  readonly byChar: ReadonlyMap<number, readonly number[]>;
  readonly ordered: readonly number[];
}

/** The variant table, built on first use. */
let table: VariantTable | undefined;

/** The other characters that match a character case-insensitively, empty for none. */
export function caseVariants(codePoint: number): readonly number[] {
  table ??= buildVariantTable();
  return table.byChar.get(codePoint) ?? [];
}

/** The case variants of every character in a range, which may repeat or fall inside the range. */
export function caseVariantsInRange(first: number, last: number): number[] {
  table ??= buildVariantTable();
  const variants: number[] = [];
  for (const codePoint of table.ordered) {
    if (codePoint > last) break;
    if (codePoint >= first) variants.push(...(table.byChar.get(codePoint) as readonly number[]));
  }
  return variants;
}

/**
 * Groups the characters that case mapping changes by their lower and upper cases, then gives each
 * the rest of its groups. Skipping unchanged characters loses none: every character a mapping
 * yields, such as `k` for `K`, is itself changed by the other mapping.
 */
function buildVariantTable(): VariantTable {
  const byLower = new Map<string, Set<number>>();
  const byUpper = new Map<string, Set<number>>();
  for (let codePoint = 0; codePoint <= LAST_CASED; codePoint++) {
    if (isSurrogate(codePoint)) continue;
    const char = String.fromCodePoint(codePoint);
    const lower = char.toLowerCase();
    const upper = char.toUpperCase();
    if (lower === char && upper === char) continue;
    addToGroup(byLower, lower, codePoint);
    addToGroup(byUpper, upper, codePoint);
  }
  const variants = new Map<number, Set<number>>();
  for (const group of [...byLower.values(), ...byUpper.values()]) addEachOther(variants, group);
  return {
    byChar: new Map([...variants].map(([codePoint, others]) => [codePoint, [...others]])),
    ordered: [...variants.keys()].toSorted((a, b) => a - b),
  };
}

/** Records every member of a group as a variant of every other member. */
function addEachOther(variants: Map<number, Set<number>>, group: Set<number>): void {
  for (const codePoint of group) {
    for (const other of group) if (other !== codePoint) addToGroup(variants, codePoint, other);
  }
}

/** Adds a member to the group under a key, starting the group if it is the first. */
function addToGroup<Key>(groups: Map<Key, Set<number>>, key: Key, member: number): void {
  const group = groups.get(key);
  if (group) group.add(member);
  else groups.set(key, new Set([member]));
}
