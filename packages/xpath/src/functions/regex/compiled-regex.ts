import type { XdmValue } from '@exemplarjs/xdm';
import { ErrorFactory, RegexError, type TranslatedRegex, translateRegex } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { stringArgument } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineWithLast } from '@/functions/signatures';

/** The string arguments of a regex function before its flags: the input, the pattern, and any others. */
type RegexArguments = readonly [input: string, pattern: string, ...rest: string[]];

/** A regex function's string arguments. */
function readStrings(args: readonly XdmValue[]): RegexArguments {
  return args.map((arg) => stringArgument(arg)) as [string, string];
}

/**
 * A regex function as two definitions, without and with a last `$flags as xs:string` argument,
 * whose implementation gets the other arguments as strings and the flags, `''` when absent.
 */
export function defineWithFlags(
  signature: string,
  implementation: (strings: RegexArguments, flags: string) => XdmValue
): FunctionDefinition[] {
  return defineWithLast(signature, '$flags as xs:string', (args, flags) =>
    implementation(readStrings(args), stringArgument(flags))
  );
}

/** A regular expression argument translated for JavaScript; FORX0001 for unknown flags, FORX0002 for a pattern that is not one. */
export function compiledRegex(pattern: string, flags: string): TranslatedRegex {
  try {
    return translateRegex(pattern, flags, 'xpath');
  } catch (error) {
    const failure = ErrorFactory.expect(error, RegexError);
    const code = failure.kind === 'invalid-flags' ? XPathErrorCode.INVALID_REGEX_FLAGS : XPathErrorCode.INVALID_REGEX;
    return dynamicError(code, failure.message);
  }
}

/** A regular expression that must not match the empty string, as `replace`, `tokenize` and `analyze-string` need; FORX0003 when it does. */
export function nonEmptyRegex(pattern: string, flags: string): TranslatedRegex {
  const translated = compiledRegex(pattern, flags);
  if (translated.regex.test(''))
    return dynamicError(
      XPathErrorCode.REGEX_MATCHES_EMPTY,
      `The regular expression ${JSON.stringify(pattern)} matches the empty string`
    );
  return translated;
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
