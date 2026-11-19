/**
 * XPath and XML Schema regular expressions as JavaScript `RegExp`s. `fn:matches`, `fn:replace`,
 * `fn:tokenize` and `fn:analyze-string` take XPath's dialect and flags (F&O 3.1 §5.6); pattern
 * facets take XSD's, which must match the whole string and has no flags (XSD 1.1 Part 2 §G).
 *
 * ```ts
 * translateRegex('[a-z-[aeiou]]+', 'i', 'xpath').regex.test('XYZ'); // true
 * translateRegex('\\d{3}', '', 'xsd').regex.test('1234'); // false: XSD anchors the pattern
 * ```
 *
 * Translations are cached, since a pattern is usually translated many times and matched more.
 */

import { ErrorFactory } from './errors.ts';
import { RegexError } from './regex-error.ts';
import { type PatternOptions, type RegexDialect, translatePattern } from './regex-parser.ts';
import { RememberedResults } from './remembered.ts';

export type { RegexDialect } from './regex-parser.ts';

/** A translated regular expression. */
export interface TranslatedRegex {
  /** The expression, with the `v` flag only, so `test` and `exec` ignore `lastIndex` and it can be shared. */
  readonly regex: RegExp;
  /** The expression with the `g` and `d` flags too, for `matchAll`, which copies it and so leaves it shared. */
  readonly global: RegExp;
  /** How many groups capture, numbered from 1 by their opening parentheses as in XPath. */
  readonly groupCount: number;
  /** Each capturing group's enclosing capturing group, by number, 0 for none; index 0 is unused. */
  readonly groupParents: readonly number[];
}

/** The flags XPath allows (F&O 3.1 §5.6.2). */
const XPATH_FLAGS = new Set(['s', 'm', 'i', 'x', 'q']);

/** How many translations are kept before the oldest is dropped. */
const CACHE_LIMIT = 500;

/** Translations by dialect, flags and pattern. */
const translations = new RememberedResults<TranslatedRegex>(CACHE_LIMIT);

/**
 * Translates an XPath or XSD regular expression with its flags into a JavaScript one. Throws a
 * `RegexError` of kind `invalid-flags` for flags the dialect does not allow, and of kind
 * `invalid-pattern` for a pattern it does not.
 */
export function translateRegex(pattern: string, flags: string, dialect: RegexDialect): TranslatedRegex {
  checkFlags(flags, dialect);
  // Valid flags hold only letters, so the separators cannot be confused.
  return translations.get(`${dialect}/${flags}/${pattern}`, () => {
    const { source, groupCount, groupParents } = translatePattern(pattern, optionsFor(flags, dialect));
    const regex = engineRegex(source, 'v', pattern);
    return { regex, global: engineRegex(source, 'dgv', pattern), groupCount, groupParents };
  });
}

/** A translated pattern as a `RegExp`; one the engine refuses, such as a quantifier above its limit, is an invalid pattern. */
function engineRegex(source: string, flags: string, pattern: string): RegExp {
  try {
    return new RegExp(source, flags);
  } catch (error) {
    const { message } = ErrorFactory.expect(error, SyntaxError);
    const reason = `the JavaScript engine does not accept it (${message})`;
    throw ErrorFactory.create(RegexError, 'invalid-pattern', reason, pattern, undefined);
  }
}

/** Throws unless every flag is one XPath allows; XSD allows none. */
function checkFlags(flags: string, dialect: RegexDialect): void {
  if (dialect === 'xsd') {
    if (flags !== '') throw flagError('XML Schema patterns take no flags', flags);
    return;
  }
  for (const flag of flags) {
    if (!XPATH_FLAGS.has(flag)) throw flagError(`"${flag}" is not one of the flags s, m, i, x and q`, flags);
  }
}

/** The error for flags the dialect does not allow. */
function flagError(reason: string, flags: string): RegexError {
  return ErrorFactory.create(RegexError, 'invalid-flags', reason, flags, undefined);
}

/** The translation options the flags ask for; `q` turns off `s`, `m` and `x`, but not `i`. */
function optionsFor(flags: string, dialect: RegexDialect): PatternOptions {
  const literal = flags.includes('q');
  return {
    dialect,
    caseInsensitive: flags.includes('i'),
    dotAll: !literal && flags.includes('s'),
    multiline: !literal && flags.includes('m'),
    ignoreWhitespace: !literal && flags.includes('x'),
    literal,
  };
}
