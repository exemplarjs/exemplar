import { EMPTY_SEQUENCE, XdmAtomicValue, type XdmValue, XS } from '@exemplarjs/xdm';
import { tryCastAs, twoDigits } from '@exemplarjs/xdm/internal';
import { WHITESPACE_CLASS } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { optionalString } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { abbreviation, ENGLISH_MONTHS, ENGLISH_WEEKDAYS } from './english-names.ts';

/** The months by their three-letter names. */
const MONTHS = ENGLISH_MONTHS.map((name) => abbreviation(name).toLowerCase());

/** The timezone names the grammar allows, as offsets from UTC. */
const ZONE_OFFSETS: Readonly<Record<string, string>> = {
  utc: 'Z',
  ut: 'Z',
  gmt: 'Z',
  est: '-05:00',
  edt: '-04:00',
  cst: '-06:00',
  cdt: '-05:00',
  mst: '-07:00',
  mdt: '-06:00',
  pst: '-08:00',
  pdt: '-07:00',
};

/** The pieces of F&O §9.9.1's grammar, as regular expression source; `S` is whitespace. */
const S = `${WHITESPACE_CLASS}+`;
const OPTIONAL_S = `${WHITESPACE_CLASS}*`;
const DAY_NAME = `(?:${[...ENGLISH_WEEKDAYS, ...ENGLISH_WEEKDAYS.map((name) => abbreviation(name))].join('|')})`;
const MONTH_NAME = `(?<month>${MONTHS.join('|')})`;
const DATE_SEPARATOR = `(?:${OPTIONAL_S}-${OPTIONAL_S}|${S})`;
const DAY_NUMBER = String.raw`(?<day>\d\d?)`;
const YEAR = String.raw`(?<year>\d\d(?:\d\d)?)`;
const ZONE_NAMES = Object.keys(ZONE_OFFSETS).join('|');
const ZONE_OFFSET = String.raw`(?<sign>[+-])(?<offsetHours>\d\d?):?(?<offsetMinutes>\d\d)?(?:${OPTIONAL_S}\(${OPTIONAL_S}(?:${ZONE_NAMES})${OPTIONAL_S}\))?`;
const TIME = String.raw`(?<hours>\d\d?):(?<minutes>\d\d)(?::(?<seconds>\d\d(?:\.\d+)?))?(?:${OPTIONAL_S}(?:(?<zone>${ZONE_NAMES})|${ZONE_OFFSET}))?`;
const START = `^${OPTIONAL_S}(?:${DAY_NAME},?${S})?`;
const END = `${OPTIONAL_S}$`;

/** The three forms a date may take: day first, month first, and the C library's `asctime`, with the year last. */
const DAY_FIRST = new RegExp(
  `${START}${DAY_NUMBER}${DATE_SEPARATOR}${MONTH_NAME}${DATE_SEPARATOR}${YEAR}${S}${TIME}${END}`,
  'i'
);
const MONTH_FIRST = new RegExp(
  `${START}${MONTH_NAME}${DATE_SEPARATOR}${DAY_NUMBER}${DATE_SEPARATOR}${YEAR}${S}${TIME}${END}`,
  'i'
);
const ASCTIME = new RegExp(`${START}${MONTH_NAME}${DATE_SEPARATOR}${DAY_NUMBER}${S}${TIME}${S}${YEAR}${END}`, 'i');

/** A two-digit year in the twentieth century, as the grammar reads it. */
const CENTURY = 1900;
/** How many digits a year in the twentieth century is written with. */
const SHORT_YEAR_LENGTH = 2;

/** The parts of a date by name, as the grammar's groups find them. */
interface IetfParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly hours: string;
  readonly minutes: string;
  readonly seconds?: string;
  readonly zone?: string;
  readonly sign?: string;
  readonly offsetHours?: string;
  readonly offsetMinutes?: string;
}

/** A timezone from a name or an offset such as `+0500` or `-5`; UTC when there is none. */
function zoneOf({ zone, sign, offsetHours, offsetMinutes }: IetfParts): string {
  if (zone !== undefined) return ZONE_OFFSETS[zone.toLowerCase()] as string;
  if (sign === undefined) return 'Z';
  return `${sign}${twoDigits(offsetHours as string)}:${offsetMinutes ?? '00'}`;
}

/** The `xs:dateTime` lexical form of a date in any of the grammar's three forms, or undefined when it is in none. */
function lexicalOf(text: string): string | undefined {
  const parts = (DAY_FIRST.exec(text) ?? MONTH_FIRST.exec(text) ?? ASCTIME.exec(text))?.groups as IetfParts | undefined;
  if (parts === undefined) return undefined;
  const year = parts.year.length === SHORT_YEAR_LENGTH ? String(CENTURY + Number(parts.year)) : parts.year;
  const date = `${year}-${twoDigits(MONTHS.indexOf(parts.month.toLowerCase()) + 1)}-${twoDigits(parts.day)}`;
  return `${date}T${twoDigits(parts.hours)}:${parts.minutes}:${parts.seconds ?? '00'}${zoneOf(parts)}`;
}

/**
 * `fn:parse-ietf-date`: a date as the Internet's mail and HTTP headers write it, such as
 * `Wed, 06 Jun 1994 07:29:35 GMT`, as a `xs:dateTime` in the timezone it names, UTC when it names
 * none; FORG0010 when it is not one.
 */
function parseIetfDate(value: XdmValue | undefined): XdmValue {
  const text = optionalString(value);
  if (text === undefined) return EMPTY_SEQUENCE;
  const lexical = lexicalOf(text);
  const parsed = lexical === undefined ? undefined : tryCastAs(XdmAtomicValue.string(lexical), XS.dateTime);
  if (parsed !== undefined) return [parsed];
  return dynamicError(
    XPathErrorCode.INVALID_IETF_DATE,
    `${JSON.stringify(text)} is not a date parse-ietf-date can read`
  );
}

/** `fn:parse-ietf-date` (F&O §9.9.1). */
export const IETF_DATE_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:parse-ietf-date($value as xs:string?) as xs:dateTime?', ([value]) => parseIetfDate(value)),
];
