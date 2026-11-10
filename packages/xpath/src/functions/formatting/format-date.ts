import { EMPTY_SEQUENCE } from '@exemplarjs/xdm';
import type { XdmValue, XMLGregorianCalendar } from '@exemplarjs/xdm';
import { remembered, trimWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { optionalAtomic, optionalString, stringArgument, stringResult } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { splitEQName } from '@/static/name-resolution';
import { DEFAULT_LANGUAGE, intlSupports } from '@/static/static-context';
import { type RenderContext, writeMarker } from './component-format.ts';
import { parseDatePicture, type PicturePart } from './date-picture.ts';
import { isWordsToken } from './integer-format.ts';

/** The calendars written as they are; any other known calendar is written as `AD` after a `[Calendar: AD]` marker. */
const SUPPORTED_CALENDARS: ReadonlySet<string> = new Set(['AD', 'ISO']);

/** The calendar designators F&O §9.8.4.3 lists, which a calendar name in no namespace must be one of. */
const KNOWN_CALENDARS: ReadonlySet<string> = new Set(
  'AD AH AME AM AP AS BE CB CE CL CS EE FE ISO JE KE KY ME MS NS OS RS SE SH SS TE VE VS'.split(' ')
);

/** The calendar used for any calendar this processor does not support. */
const FALLBACK_CALENDAR = 'AD';

/** A choice of language or calendar, and the marker that goes before the result when it differs from the one asked for. */
interface Choice<T> {
  readonly chosen: T;
  readonly marker: string;
}

/** A calendar name's local part and whether it is in a namespace, or undefined when it is not an EQName. */
function readCalendarName(name: string): { readonly local: string; readonly inNamespace: boolean } | undefined {
  const parts = splitEQName(name);
  if (parts === undefined) return undefined;
  // A prefix needs a namespace, though its URI cannot be resolved here.
  const inNamespace = parts.prefix !== '' || (parts.uri !== undefined && parts.uri !== '');
  return { local: parts.localName, inNamespace };
}

/**
 * The calendar a `$calendar` argument names: `AD` when it is absent. A known designator or a name in
 * a namespace that is not `AD` or `ISO` falls back to `AD` with a `[Calendar: AD]` marker; a name
 * that is not an EQName, or a designator F&O does not list, is FOFD1340.
 */
function calendarNamed(name: string | undefined): Choice<string> {
  if (name === undefined) return { chosen: FALLBACK_CALENDAR, marker: '' };
  const trimmed = trimWhitespace(name);
  const calendar = readCalendarName(trimmed);
  if (calendar === undefined)
    return dynamicError(XPathErrorCode.INVALID_DATE_TIME_PICTURE, `'${trimmed}' is not a calendar name`);
  if (!calendar.inNamespace && !KNOWN_CALENDARS.has(calendar.local))
    dynamicError(XPathErrorCode.INVALID_DATE_TIME_PICTURE, `'${trimmed}' is not a known calendar`);
  if (!calendar.inNamespace && SUPPORTED_CALENDARS.has(calendar.local)) return { chosen: calendar.local, marker: '' };
  return { chosen: FALLBACK_CALENDAR, marker: `[Calendar: ${FALLBACK_CALENDAR}]` };
}

/** Whether a picture writes words, ordinals, day periods or eras, which are in English only. */
function needsEnglish(parts: readonly PicturePart[]): boolean {
  return parts.some(
    (part) =>
      typeof part !== 'string' &&
      (part.component === 'P' || part.component === 'E' || part.ordinal || isWordsToken(part.presentation))
  );
}

/**
 * The locale names are written in: none for English, the language when `Intl` supports it and the
 * picture writes nothing English only, else English after a `[Language: en]` marker.
 */
function languageFor(language: string | undefined, parts: readonly PicturePart[]): Choice<string | undefined> {
  const asked = trimWhitespace(language ?? '');
  if (asked === '' || asked.split(/[-_]/)[0]?.toLowerCase() === DEFAULT_LANGUAGE)
    return { chosen: undefined, marker: '' };
  if (intlSupports(Intl.DateTimeFormat, asked) && !needsEnglish(parts)) return { chosen: asked, marker: '' };
  return { chosen: undefined, marker: `[Language: ${DEFAULT_LANGUAGE}]` };
}

/** A picture's parts, parsed once for a picture given again. */
const datePicture = remembered(parseDatePicture);

/**
 * `fn:format-dateTime`, `fn:format-date` and `fn:format-time`: a value as a picture writes it,
 * in a language and calendar; empty for an empty value. The place argument is not used.
 */
function formatDateTime(args: readonly XdmValue[]): XdmValue {
  const parts = datePicture(stringArgument(args[1]));
  const value = optionalAtomic(args[0])?.value as XMLGregorianCalendar | undefined;
  if (value === undefined) return EMPTY_SEQUENCE;
  const calendar = calendarNamed(optionalString(args[3]));
  const language = languageFor(optionalString(args[2]), parts);
  const context: RenderContext = { locale: language.chosen, calendar: calendar.chosen };
  const written = parts.map((part) => (typeof part === 'string' ? part : writeMarker(part, value, context)));
  return stringResult(`${calendar.marker}${language.marker}${written.join('')}`);
}

/** The three functions, each with two and with five arguments (F&O §9.8). */
export const FORMAT_DATE_FUNCTIONS: readonly FunctionDefinition[] = (['dateTime', 'date', 'time'] as const).flatMap(
  (type) => [
    defineFunction(`fn:format-${type}($value as xs:${type}?, $picture as xs:string) as xs:string?`, formatDateTime),
    defineFunction(
      `fn:format-${type}($value as xs:${type}?, $picture as xs:string, $language as xs:string?, ` +
        `$calendar as xs:string?, $place as xs:string?) as xs:string?`,
      formatDateTime
    ),
  ]
);
