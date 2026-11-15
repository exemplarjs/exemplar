/** What a regular expression error rejects: its flags (XPath's FORX0001) or its pattern (FORX0002). */
export type RegexErrorKind = 'invalid-flags' | 'invalid-pattern';

/**
 * A regular expression or its flags that XPath or XML Schema does not allow, such as the pattern
 * `a{2,1}` or the flag `g`. The message names the pattern, where in it the problem lies and why.
 */
export class RegexError extends Error {
  /** Whether the flags or the pattern are at fault. */
  readonly kind: RegexErrorKind;
  /** Why the pattern or flags are not allowed, such as `the quantifier's minimum 2 is above its maximum 1`. */
  readonly reason: string;
  /** The pattern, or the flags when they are at fault. */
  readonly pattern: string;
  /** Where in the pattern the problem lies, counting characters (not code units) from 0; undefined for flags. */
  readonly index: number | undefined;

  constructor(kind: RegexErrorKind, reason: string, pattern: string, index: number | undefined) {
    super(
      kind === 'invalid-flags'
        ? `Invalid regular expression flags "${pattern}": ${reason}`
        : `Invalid regular expression "${pattern}" at character ${(index as number) + 1}: ${reason}`
    );
    this.name = 'RegexError';
    this.kind = kind;
    this.reason = reason;
    this.pattern = pattern;
    this.index = index;
  }
}
