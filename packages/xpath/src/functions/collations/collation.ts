import { byCodePoint } from '@exemplarjs/xml/internal';
import { FN_NAMESPACE } from '@/static/static-context';

/** The codepoint collation's URI, the default collation. */
export const CODEPOINT_COLLATION = `${FN_NAMESPACE}/collation/codepoint`;

/** The HTML ASCII case-insensitive collation's URI (F&O §5.3.4). */
export const HTML_ASCII_CASE_INSENSITIVE_COLLATION = `${FN_NAMESPACE}/collation/html-ascii-case-insensitive`;

/** Where a search string matched within a text: from `index`, for `length` UTF-16 units. */
export interface CollationMatch {
  readonly index: number;
  readonly length: number;
}

/** Where a match must lie: anywhere, at the start of the text, or at its end. */
export type MatchAnchor = 'anywhere' | 'start' | 'end';

/**
 * A collation: a way of comparing strings, as the functions that take a `$collation` argument use
 * it (F&O §5.3). Each compares two strings, finds one inside another for `contains` and its kin,
 * and may give the keys `collation-key` returns.
 *
 * ```ts
 * const collation = resolveCollation(HTML_ASCII_CASE_INSENSITIVE_COLLATION, undefined);
 * collation.compare('ABC', 'abc'); // 0
 * collation.find('Hello', 'LL', 'anywhere'); // { index: 2, length: 2 }
 * ```
 */
export interface Collation {
  readonly uri: string;
  /** Negative, zero or positive as `a` sorts before, with or after `b`. */
  readonly compare: (a: string, b: string) => number;
  /** The first, shortest match of `search` within `text` that this collation finds equal, or undefined. */
  readonly find: (text: string, search: string, anchor: MatchAnchor) => CollationMatch | undefined;
  /** Bytes that order and compare as the strings do under this collation, or undefined when it has none to give. */
  readonly key: (text: string) => Uint8Array | undefined;
}

/** Finds a search string by exact text, as the codepoint collation compares. */
function findExactly(text: string, search: string, anchor: MatchAnchor): CollationMatch | undefined {
  let index: number;
  if (anchor === 'start') index = text.startsWith(search) ? 0 : -1;
  else if (anchor === 'end') index = text.endsWith(search) ? text.length - search.length : -1;
  else index = text.indexOf(search);
  return index === -1 ? undefined : { index, length: search.length };
}

/** Writes text as UTF-8, whose bytes order as its code points do. */
const UTF8 = new TextEncoder();

/** The codepoint collation: strings compare by their code points, and match only exactly. */
export const codepointCollation: Collation = {
  uri: CODEPOINT_COLLATION,
  compare: byCodePoint,
  find: findExactly,
  key: (text) => UTF8.encode(text),
};

/** ASCII letters in lower case, others as they are, as the HTML collation compares them. */
function asciiLowerCase(text: string): string {
  return text.replaceAll(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** The HTML ASCII case-insensitive collation: code points, with `A` to `Z` taken as `a` to `z`. */
export const htmlAsciiCaseInsensitiveCollation: Collation = {
  uri: HTML_ASCII_CASE_INSENSITIVE_COLLATION,
  compare: (a, b) => byCodePoint(asciiLowerCase(a), asciiLowerCase(b)),
  // Lowering ASCII keeps every string's length, so a match in the lowered text is one in the text.
  find: (text, search, anchor) => findExactly(asciiLowerCase(text), asciiLowerCase(search), anchor),
  key: (text) => UTF8.encode(asciiLowerCase(text)),
};
