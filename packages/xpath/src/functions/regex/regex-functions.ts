import { EMPTY_SEQUENCE, XdmAtomicValue, type XdmValue } from '@exemplarjs/xdm';
import { isAsciiDigit, Radix, splitWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { booleanResult, stringArgument, stringResult } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { compiledRegex, defineWithFlags, nonEmptyRegex, segments } from './compiled-regex.ts';

/** A piece of a replacement string: literal text, or the text a group matched, 0 being the whole match. */
type ReplacementPart = string | { readonly group: number };

/** The lengths of a `$` with its first digit, and of a `\\` or `\$` escape. */
const FIRST_REFERENCE_LENGTH = 2;
const ESCAPE_LENGTH = 2;

/** A replacement string with a bad `\` or `$`: FORX0004. */
function invalidReplacement(replacement: string): never {
  return dynamicError(
    XPathErrorCode.INVALID_REPLACEMENT,
    `${JSON.stringify(replacement)} is not a valid replacement string`
  );
}

/** A group reference after a `$` at `index`: its number as long as a group of it exists, and where it ends. */
function groupReference(replacement: string, index: number, groupCount: number): { group: number; end: number } {
  let group = Number(replacement[index + 1]);
  let end = index + FIRST_REFERENCE_LENGTH;
  while (isAsciiDigit(replacement[end]) && group * Radix.DECIMAL + Number(replacement[end]) <= groupCount) {
    group = group * Radix.DECIMAL + Number(replacement[end]);
    end++;
  }
  return { group, end };
}

/**
 * A replacement string's parts (F&O §5.6.4): `\\` and `\$` stand for themselves, and `$` with
 * digits for a group, its number as long as a group of that number exists, any further digits
 * text; FORX0004 for any other `\` or `$`. With the `q` flag the string is all text.
 */
function replacementParts(replacement: string, groupCount: number, literal: boolean): ReplacementPart[] {
  if (literal) return [replacement];
  const parts: ReplacementPart[] = [];
  let text = '';
  let index = 0;
  while (index < replacement.length) {
    const character = replacement[index] as string;
    const next = replacement[index + 1];
    if (character === '\\') {
      if (next !== '\\' && next !== '$') invalidReplacement(replacement);
      text += next;
      index += ESCAPE_LENGTH;
    } else if (character === '$') {
      if (!isAsciiDigit(next)) invalidReplacement(replacement);
      const reference = groupReference(replacement, index, groupCount);
      parts.push(text, { group: reference.group });
      text = '';
      index = reference.end;
    } else {
      text += character;
      index++;
    }
  }
  parts.push(text);
  return parts;
}

/** `fn:replace`: each match replaced by the replacement, its group references filled in; a group that matched nothing gives `''`. */
function replace(input: string, pattern: string, replacement: string, flags: string): string {
  const translated = nonEmptyRegex(pattern, flags);
  const parts = replacementParts(replacement, translated.groupCount, flags.includes('q'));
  let result = '';
  for (const { from, match } of segments(translated, input)) {
    result += input.slice(from, match?.index);
    if (match === undefined) break;
    for (const part of parts) {
      if (typeof part === 'string') result += part;
      else result += match[part.group] ?? '';
    }
  }
  return result;
}

/** `fn:tokenize`: the text between the separators the pattern matches, empty for empty input; a separator at the start gives a leading `''`. */
function tokenize(input: string, pattern: string, flags: string): XdmValue {
  const translated = nonEmptyRegex(pattern, flags);
  if (input === '') return EMPTY_SEQUENCE;
  return [...segments(translated, input)].flatMap(({ from, match }) => stringResult(input.slice(from, match?.index)));
}

/** The regular expression functions (F&O §5.6), but `analyze-string`, which builds a tree. */
export const REGEX_FUNCTIONS: readonly FunctionDefinition[] = [
  ...defineWithFlags(
    'fn:matches($input as xs:string?, $pattern as xs:string) as xs:boolean',
    ([input, pattern], flags) => booleanResult(compiledRegex(pattern, flags).regex.test(input))
  ),
  ...defineWithFlags(
    'fn:replace($input as xs:string?, $pattern as xs:string, $replacement as xs:string) as xs:string',
    ([input, pattern, replacement = ''], flags) => stringResult(replace(input, pattern, replacement, flags))
  ),
  defineFunction('fn:tokenize($input as xs:string?) as xs:string*', ([input]) =>
    splitWhitespace(stringArgument(input)).map((token) => XdmAtomicValue.string(token))
  ),
  ...defineWithFlags(
    'fn:tokenize($input as xs:string?, $pattern as xs:string) as xs:string*',
    ([input, pattern], flags) => tokenize(input, pattern, flags)
  ),
];
