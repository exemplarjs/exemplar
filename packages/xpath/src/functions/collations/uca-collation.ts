import { byCodePoint } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { DEFAULT_LANGUAGE, intlSupports } from '@/static/static-context';
import type { Collation, CollationMatch, MatchAnchor } from './collation.ts';

/** The URI of the Unicode Collation Algorithm's collations, before any parameters (F&O §5.3.3). */
export const UCA_COLLATION = 'http://www.w3.org/2013/collation/UCA';

/** The strengths in order, which a URI may also give by number, `1` for the primary. */
const STRENGTHS = ['primary', 'secondary', 'tertiary', 'quaternary', 'identical'];

/** The strength names by their numbers. */
const STRENGTH_NAMES: ReadonlyMap<string, string> = new Map(STRENGTHS.map((name, index) => [String(index + 1), name]));

/** The values of each parameter that `Intl.Collator` honours exactly; others are approximated, or refused without fallback. */
const HONOURED: Readonly<Record<string, readonly string[]>> = {
  fallback: ['yes', 'no'],
  strength: STRENGTHS,
  maxVariable: ['punct'],
  alternate: ['non-ignorable', 'shifted'],
  backwards: ['no'],
  normalization: ['yes', 'no'],
  caseLevel: ['yes', 'no'],
  caseFirst: ['upper', 'lower'],
  numeric: ['yes', 'no'],
};

/** The `Intl.Collator` sensitivity of the strengths below the tertiary: base letters, then accents too. */
const SENSITIVITY: Readonly<Record<string, Intl.CollatorOptions['sensitivity']>> = {
  primary: 'base',
  secondary: 'accent',
};

/** A collation URI that cannot be honoured: FOCH0002. */
function unsupported(uri: string, reason: string): never {
  return dynamicError(XPathErrorCode.UNSUPPORTED_COLLATION, `The collation ${uri} is not supported: ${reason}`);
}

/**
 * A UCA collation URI's parameters, by keyword: `lang=de;strength=primary` and the like, a
 * strength given by number as its name; a keyword given twice keeps its last value.
 */
function parametersOf(uri: string): Map<string, string> {
  const pairs = uri
    .slice(UCA_COLLATION.length + 1)
    .split(';')
    .filter((pair) => pair !== '');
  const parameters = new Map(pairs.map((pair) => [pair.split('=', 1)[0] as string, pair.slice(pair.indexOf('=') + 1)]));
  const strength = STRENGTH_NAMES.get(parameters.get('strength') ?? '');
  if (strength !== undefined) parameters.set('strength', strength);
  return parameters;
}

/** For a URI that says `fallback=no`: FOCH0002 for any keyword, value or language `Intl.Collator` cannot honour exactly. */
function requireHonoured(uri: string, parameters: ReadonlyMap<string, string>): void {
  for (const [keyword, value] of parameters) {
    if (keyword === 'lang') continue;
    if (HONOURED[keyword]?.includes(value) !== true) unsupported(uri, `${keyword}=${value}`);
  }
  // Intl can keep case apart from accents only at the primary strength.
  if (parameters.get('caseLevel') === 'yes' && SENSITIVITY[parameters.get('strength') ?? ''] === 'accent')
    unsupported(uri, 'caseLevel=yes at the secondary strength');
}

/** The language to collate by: the one named if the runtime supports it, else, with fallback, the default. */
function languageOf(uri: string, lang: string | undefined, fallback: boolean): string {
  if (lang === undefined) return DEFAULT_LANGUAGE;
  if (intlSupports(Intl.Collator, lang)) return lang;
  return fallback ? DEFAULT_LANGUAGE : unsupported(uri, `the language ${lang}`);
}

/**
 * A comparison at a strength: `Intl.Collator`'s for the first three levels; at the quaternary,
 * ties broken by the punctuation `alternate=shifted` set aside; at the identical, then by the
 * strings' code points after canonical decomposition (UTS #10 §3.6 and §4.3).
 */
function levelledCompare(locale: string, options: Intl.CollatorOptions, strength: string): Collation['compare'] {
  const tertiary = new Intl.Collator(locale, options).compare;
  const identical = strength === 'identical';
  if (strength !== 'quaternary' && !identical) return tertiary;
  const quaternary = new Intl.Collator(locale, { ...options, ignorePunctuation: false }).compare;
  return (first, second) => {
    const order = tertiary(first, second) || quaternary(first, second);
    if (order !== 0 || !identical) return order;
    return byCodePoint(first.normalize('NFD'), second.normalize('NFD'));
  };
}

/**
 * A comparison from a UCA collation URI, through `Intl.Collator` with every option given
 * explicitly, from the URI or its default, so that no runtime's own default for a language
 * changes the order. A value `Intl.Collator` cannot honour exactly, such as `backwards=yes`, is
 * approximated when the URI allows fallback, and raises FOCH0002 when it says `fallback=no`.
 */
function uriCompare(uri: string): Collation['compare'] {
  const parameters = parametersOf(uri);
  const fallback = parameters.get('fallback') !== 'no';
  if (!fallback) requireHonoured(uri, parameters);
  const strength = parameters.get('strength') ?? 'tertiary';
  const caseLevel = parameters.get('caseLevel') === 'yes';
  const strengthSensitivity = SENSITIVITY[strength] ?? 'variant';
  // A case level adds case to the primary level; above it only `variant` keeps case.
  const caseSensitivity = strengthSensitivity === 'base' ? 'case' : 'variant';
  const sensitivity = caseLevel ? caseSensitivity : strengthSensitivity;
  const alternate = parameters.get('alternate');
  return levelledCompare(
    languageOf(uri, parameters.get('lang'), fallback),
    {
      usage: 'sort',
      sensitivity,
      caseFirst: parameters.get('caseFirst') === 'upper' ? 'upper' : 'lower',
      numeric: parameters.get('numeric') === 'yes',
      ignorePunctuation: alternate === 'shifted' || alternate === 'blanked',
    },
    strength
  );
}

/**
 * The minimal match of a search string within a text, by a comparison (F&O §5.3.1): the stretch
 * that ends first, and of those ending there the shortest, so that characters the comparison
 * ignores at either end stay outside the match. A start or end anchor fixes that end.
 */
function findCollated(
  compare: Collation['compare'],
  text: string,
  search: string,
  anchor: MatchAnchor
): CollationMatch | undefined {
  const positions = [0];
  for (const character of text) positions.push((positions.at(-1) as number) + character.length);
  for (const end of anchor === 'end' ? [text.length] : positions) {
    const starts = anchor === 'start' ? [0] : positions.filter((position) => position <= end).toReversed();
    const start = starts.find((position) => compare(text.slice(position, end), search) === 0);
    if (start !== undefined) return { index: start, length: end - start };
  }
  return undefined;
}

/**
 * A collation of the Unicode Collation Algorithm, as a UCA collation URI describes it, through
 * the runtime's `Intl.Collator`; the order follows the runtime's ICU data. It finds substrings by
 * trying each stretch of the text, and gives no collation keys, which `Intl` cannot make.
 */
export function ucaCollation(uri: string): Collation {
  const compare = uriCompare(uri);
  return {
    uri,
    compare,
    find: (text, search, anchor) => findCollated(compare, text, search, anchor),
    key: () => undefined,
  };
}
