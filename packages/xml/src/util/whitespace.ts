import { Char } from './chars.ts';

// Module-level constants, so V8 can inline them.
const { CARRIAGE_RETURN, LINE_FEED, LINE_SEPARATOR, NEXT_LINE, SPACE, TAB } = Char;

/**
 * Whether a code unit is whitespace in markup (S, §2.3 [3]): space, tab, LF or CR. In XML 1.1,
 * NEL and LS count too: line-end normalization turns them into LF (XML 1.1 §2.11), and the
 * scanners read text before it is normalized.
 */
export function isWhitespaceChar(char: number, version11: boolean): boolean {
  if (char === SPACE || char === LINE_FEED || char === TAB || char === CARRIAGE_RETURN) return true;
  return version11 && (char === NEXT_LINE || char === LINE_SEPARATOR);
}

/** Whether the span `[start, end)` of text holds only whitespace, as `isWhitespaceChar` decides it. */
export function isWhitespaceSpan(text: string, start: number, end: number, version11: boolean): boolean {
  for (let i = start; i < end; i++) {
    // eslint-disable-next-line prefer-code-point -- spaces and line ends are single code units
    if (!isWhitespaceChar(text.charCodeAt(i), version11)) return false;
  }
  return true;
}

/** Whether text is all whitespace (S, §2.3 [3]): space, tab, LF and CR. True for the empty string. */
export function isAllWhitespace(text: string): boolean {
  return isWhitespaceSpan(text, 0, text.length, false);
}

/** XML's whitespace characters (S, §2.3 [3]) as a regex character class, for building patterns. */
export const WHITESPACE_CLASS = String.raw`[\t\n\r ]`;

/** Runs of whitespace (S); `replaceAll` and `split` both ignore its `lastIndex`. */
const WHITESPACE_RUN = new RegExp(`${WHITESPACE_CLASS}+`, 'g');

/** Text with each run of whitespace (S) made one space, and none at either end. JavaScript's `trim()` takes more, such as U+00A0. */
export function collapseWhitespace(text: string): string {
  return text.replaceAll(WHITESPACE_RUN, ' ').replace(/^ /, '').replace(/ $/, '');
}

/** Text without whitespace (S) at either end. */
export function trimWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  // eslint-disable-next-line prefer-code-point -- spaces and line ends are single code units
  while (start < end && isWhitespaceChar(text.charCodeAt(start), false)) start++;
  // eslint-disable-next-line prefer-code-point -- spaces and line ends are single code units
  while (end > start && isWhitespaceChar(text.charCodeAt(end - 1), false)) end--;
  return text.slice(start, end);
}

/** The tokens of text separated by whitespace (S), without empty ones. */
export function splitWhitespace(text: string): string[] {
  const trimmed = trimWhitespace(text);
  return trimmed === '' ? [] : trimmed.split(WHITESPACE_RUN);
}

/** Normalizes a public identifier (§4.2.2, XML Catalogs §6.2): whitespace collapsed. */
export function normalizePublicId(id: string): string {
  return collapseWhitespace(id);
}
