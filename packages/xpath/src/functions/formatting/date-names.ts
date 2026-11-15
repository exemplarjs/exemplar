import { remembered } from '@exemplarjs/xml/internal';
import { characters } from '@/functions/core/values';
import { ABBREVIATION_LENGTH, ENGLISH_MONTHS, ENGLISH_WEEKDAYS } from '@/functions/date-time/english-names';
import type { WidthModifier } from './date-picture.ts';

/**
 * The names `format-date` and its kin write for `[MNn]`, `[FNn]`, `[P]`, `[E]` and `[C]`: English
 * from the tables here, so that English never depends on what `Intl` a runtime has, and month and
 * weekday names in other languages from `Intl.DateTimeFormat`. A name too long for a width's
 * maximum is shortened: an English one to its usual three-letter form, another to its first letters.
 *
 * @example
 * writeName({ kind: 'month', index: 9 }, 'Nn', undefined, { minimum: 3, maximum: 3 }); // 'Sep'
 */

/** The names that have tables: months 1 to 12, weekdays 1 (Monday) to 7, and the halves of the day, 1 (am) and 2 (pm). */
type NameKind = 'month' | 'weekday' | 'dayPeriod';

/** A name to write: a kind and its number, or text such as an era or calendar name. */
export type NamedValue =
  | { readonly kind: NameKind; readonly index: number }
  | { readonly kind: 'text'; readonly text: string };

/** How a name is capitalized: `n` lower case, `N` upper case, `Nn` title case. */
export type NameCase = 'n' | 'N' | 'Nn';

/** The English names, from which other languages' are never taken. */
const ENGLISH_NAMES: Readonly<Record<NameKind, readonly string[]>> = {
  month: ENGLISH_MONTHS,
  weekday: ENGLISH_WEEKDAYS,
  dayPeriod: ['am', 'pm'],
};

/** The year of the dates `Intl` names are read from: it began on a Monday, so its first seven days are Monday to Sunday. */
const NAME_YEAR = 2001;

/** The `Intl` formats month and weekday names are read with, by locale. */
const NAME_FORMATS = {
  month: remembered((locale) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })),
  weekday: remembered((locale) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })),
};

/** A month or weekday name in a language `Intl` supports, read from the parts of a formatted date. */
function intlName(kind: 'month' | 'weekday', index: number, locale: string): string {
  const format = NAME_FORMATS[kind](locale);
  const date = kind === 'month' ? Date.UTC(NAME_YEAR, index - 1, 1) : Date.UTC(NAME_YEAR, 0, index);
  return (format.formatToParts(date).find((part) => part.type === kind) as Intl.DateTimeFormatPart).value;
}

/** A name in full: from `Intl` for a month or weekday in another language, else English. */
function fullName(value: NamedValue, locale: string | undefined): string {
  if (value.kind === 'text') return value.text;
  if (locale !== undefined && value.kind !== 'dayPeriod') return intlName(value.kind, value.index, locale);
  return ENGLISH_NAMES[value.kind][value.index - 1] as string;
}

/** A name capitalized as a presentation modifier asks. */
function inNameCase(name: string, nameCase: NameCase, locale: string | undefined): string {
  if (nameCase === 'N') return name.toLocaleUpperCase(locale);
  const lower = name.toLocaleLowerCase(locale);
  if (nameCase === 'n') return lower;
  const first = characters(lower)[0] as string;
  return `${first.toLocaleUpperCase(locale)}${lower.slice(first.length)}`;
}

/** A name no longer than a maximum: an English month or weekday by its abbreviation when that fits, else its first characters. */
function shortened(name: string, value: NamedValue, locale: string | undefined, maximum: number): string {
  const chars = characters(name);
  if (chars.length <= maximum) return name;
  const english = locale === undefined && (value.kind === 'month' || value.kind === 'weekday');
  const abbreviates = english && maximum >= ABBREVIATION_LENGTH;
  const length = abbreviates ? ABBREVIATION_LENGTH : maximum;
  return chars.slice(0, length).join('');
}

/**
 * A name as a marker writes it: in full or shortened to fit the width's maximum, capitalized, and
 * padded with spaces to its minimum. With no locale, or for the day periods, it is English.
 */
export function writeName(
  value: NamedValue,
  nameCase: NameCase,
  locale: string | undefined,
  width: WidthModifier | undefined
): string {
  const name = inNameCase(fullName(value, locale), nameCase, locale);
  const maximum = width?.maximum;
  const fitted = maximum === undefined ? name : shortened(name, value, locale, maximum);
  return fitted.padEnd(width?.minimum ?? 0, ' ');
}
