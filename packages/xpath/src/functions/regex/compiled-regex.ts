import type { XdmValue } from '@exemplarjs/xdm';
import {
  checkRegexFlags,
  ErrorFactory,
  LruCache,
  RegexError,
  type TranslatedRegex,
  translateRegex,
} from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { stringArgument } from '@/functions/core/values';
import { CALL_CACHE_CAPACITY, type FunctionDefinition } from '@/functions/function-library';
import { defineStatefulWithLast } from '@/functions/signatures';

/** The string arguments of a regex function before its flags: the input, the pattern, and any others. */
type RegexArguments = readonly [input: string, pattern: string, ...rest: string[]];

/** A regex function's string arguments. */
function readStrings(args: readonly XdmValue[]): RegexArguments {
  return args.map((arg) => stringArgument(arg)) as [string, string];
}

/** Whether a regex function's pattern may match the empty string, as `matches` allows and the functions that divide text do not. */
type EmptyMatch = 'allowed' | 'refused';

/**
 * A regex function as two definitions, without and with a last `$flags as xs:string` argument.
 * Its implementation gets the other arguments as strings, the pattern translated, and the flags,
 * `''` when absent. Each place the function is called from keeps the patterns it has translated,
 * so one written in the expression is translated once however many times the call runs.
 */
export function defineWithFlags(
  signature: string,
  emptyMatch: EmptyMatch,
  implementation: (strings: RegexArguments, regex: TranslatedRegex, flags: string) => XdmValue
): FunctionDefinition[] {
  return defineStatefulWithLast(signature, '$flags as xs:string', () => {
    const translated = new LruCache<string, TranslatedRegex>(CALL_CACHE_CAPACITY);
    return (args, last) => {
      const strings = readStrings(args);
      const flags = stringArgument(last);
      return implementation(strings, translatedRegex(translated, strings[1], flags, emptyMatch), flags);
    };
  });
}

/**
 * A regular expression translated for JavaScript, from a call's cache when it has translated it
 * before: FORX0001 for unknown flags, FORX0002 for a pattern that is not one, and FORX0003 for one
 * that matches the empty string where it must not. One that fails is not cached.
 */
function translatedRegex(
  cache: LruCache<string, TranslatedRegex>,
  pattern: string,
  flags: string,
  emptyMatch: EmptyMatch
): TranslatedRegex {
  try {
    // Checked before the lookup: valid flags hold only letters, so the key tells flags from pattern.
    checkRegexFlags(flags, 'xpath');
    return cache.computeIfAbsent(`${flags}/${pattern}`, () => {
      const translated = translateRegex(pattern, flags, 'xpath');
      if (emptyMatch === 'allowed' || !translated.regex.test('')) return translated;
      const reason = `The regular expression ${JSON.stringify(pattern)} matches the empty string`;
      return dynamicError(XPathErrorCode.REGEX_MATCHES_EMPTY, reason);
    });
  } catch (error) {
    const failure = ErrorFactory.expect(error, RegexError);
    const code = failure.kind === 'invalid-flags' ? XPathErrorCode.INVALID_REGEX_FLAGS : XPathErrorCode.INVALID_REGEX;
    return dynamicError(code, failure.message);
  }
}

/** A stretch of a text a regular expression divides: from `from` to a match, or to the end after the last one. */
export interface Segment {
  readonly from: number;
  readonly match: RegExpExecArray | undefined;
}

/** The segments of a text, in order: one per match, each match with its groups' positions, then the rest. */
export function* segments(translated: TranslatedRegex, text: string): Generator<Segment> {
  let from = 0;
  for (const match of text.matchAll(translated.global)) {
    yield { from, match };
    from = match.index + match[0].length;
  }
  yield { from, match: undefined };
}
