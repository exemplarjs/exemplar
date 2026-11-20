import type { Decimal, XMLGregorianCalendar } from '@exemplarjs/xdm';
import { type CivilDate, HOURS_PER_HALF_DAY, powerOfTen } from '@exemplarjs/xdm/internal';
import type { LruCache } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { characters } from '@/functions/core/values';
import { dayOfYear, isoWeekday, weekOfMonth, weekOfYear } from './date-components.ts';
import { type NameCase, type NamedValue, type NameLanguage, writeName } from './date-names.ts';
import type { Component, VariableMarker, WidthModifier } from './date-picture.ts';
import { decimalDigits, type DigitPattern, formatDigits, hasDecimalDigit, parseDigitPattern } from './digit-pattern.ts';
import { formatInteger, isPrimaryToken, parsePrimaryToken, type PrimaryToken } from './integer-format.ts';
import { formatTimezone } from './timezone-format.ts';

/**
 * What a marker is written with besides the value: the language for names, the calendar, and the
 * caches of the call the markers are written for, which hold the number tokens and the fraction
 * patterns its markers have had parsed, by presentation.
 */
export interface RenderContext {
  readonly language: NameLanguage;
  readonly calendar: string;
  readonly numberTokens: LruCache<string, PrimaryToken>;
  readonly fractionPatterns: LruCache<string, DigitPattern>;
}

/** What a component needs of a value: its date, its time of day, or neither. */
type Needs = 'date' | 'time' | 'none';

/** Each component's default presentation modifier and what it needs (F&O §9.8.4.2). */
const COMPONENT_RULES: Readonly<Record<Component, { readonly presentation: string; readonly needs: Needs }>> = {
  Y: { presentation: '1', needs: 'date' },
  M: { presentation: '1', needs: 'date' },
  D: { presentation: '1', needs: 'date' },
  d: { presentation: '1', needs: 'date' },
  F: { presentation: 'n', needs: 'date' },
  W: { presentation: '1', needs: 'date' },
  w: { presentation: '1', needs: 'date' },
  H: { presentation: '1', needs: 'time' },
  h: { presentation: '1', needs: 'time' },
  P: { presentation: 'n', needs: 'time' },
  m: { presentation: '01', needs: 'time' },
  s: { presentation: '01', needs: 'time' },
  f: { presentation: '1', needs: 'time' },
  Z: { presentation: '01:01', needs: 'none' },
  z: { presentation: '01:01', needs: 'none' },
  C: { presentation: 'n', needs: 'none' },
  E: { presentation: 'n', needs: 'date' },
};

/** The presentation modifiers that ask for a name. */
const NAME_CASES: ReadonlySet<string> = new Set(['n', 'N', 'Nn']);

/** The `dayPeriod` name indexes `P` writes: 1 for am, 2 for pm. */
const AM = 1;
const PM = 2;

/** Whether a presentation modifier asks for a name. */
function isNameCase(presentation: string | undefined): presentation is NameCase {
  return presentation !== undefined && NAME_CASES.has(presentation);
}

/** A marker without a presentation this processor lacks, so that the component's default applies (F&O §9.8.4.2). */
function supported(marker: VariableMarker): VariableMarker {
  const presentation = marker.presentation;
  if (presentation === undefined || isNameCase(presentation) || isPrimaryToken(presentation)) return marker;
  return { ...marker, presentation: undefined };
}

/** The presentation a number is written in: the marker's own unless it asks for a name, else `1` with a width, else the default. */
function numberPresentation(marker: VariableMarker): string {
  if (marker.presentation !== undefined && !isNameCase(marker.presentation)) return marker.presentation;
  return marker.width === undefined ? COMPONENT_RULES[marker.component].presentation : '1';
}

/** The most digits of a year a marker keeps: the width's maximum, or the digit signs of a pattern with several. */
function yearMaximum(token: PrimaryToken, width: WidthModifier | undefined): number | undefined {
  if (width !== undefined) return width.maximum;
  if (token.kind === 'decimal' && token.pattern.digitSigns > 1) return token.pattern.digitSigns;
  return undefined;
}

/** A marker's number token, read from its presentation. */
function numberToken(presentation: string): PrimaryToken {
  return parsePrimaryToken(presentation, XPathErrorCode.INVALID_DATE_TIME_PICTURE);
}

/** A non-negative number as a marker writes it: by its token, padded to the width's minimum, a year cut to its maximum. */
function writeNumber(value: bigint, marker: VariableMarker, context: RenderContext): string {
  const token = context.numberTokens.computeIfAbsent(numberPresentation(marker), numberToken);
  const minimum = marker.width?.minimum ?? 0;
  const maximum = marker.component === 'Y' ? yearMaximum(token, marker.width) : undefined;
  const kept = maximum === undefined ? value : value % powerOfTen(maximum);
  if (token.kind !== 'decimal') return formatInteger(kept, token, { ordinal: marker.ordinal }).padEnd(minimum, ' ');
  return formatInteger(kept, token, {
    ordinal: marker.ordinal,
    minimumDigits: Math.max(token.pattern.mandatoryDigits, minimum),
  });
}

/** Text with its characters in reverse order. */
function reversed(text: string): string {
  return characters(text).toReversed().join('');
}

/** A fraction's digit pattern, read from the right of its presentation. */
function fractionPattern(presentation: string): DigitPattern {
  return parseDigitPattern(reversed(presentation), XPathErrorCode.INVALID_DATE_TIME_PICTURE, presentation);
}

/**
 * The fraction of a second as `f` writes it: a digit pattern is read from the left, so `001`
 * gives three digits and `1##` one to three. Digits beyond the maximum are cut, not rounded.
 */
function writeFraction(fraction: Decimal, marker: VariableMarker, context: RenderContext): string {
  const presentation = numberPresentation(marker);
  const digits = decimalDigits(fraction).fraction;
  if (!hasDecimalDigit(presentation)) return writeNumber(BigInt(digits === '' ? '0' : digits), marker, context);
  const pattern = context.fractionPatterns.computeIfAbsent(presentation, fractionPattern);
  const minimum = Math.max(pattern.mandatoryDigits, marker.width?.minimum ?? 0);
  const widthMaximum = marker.width?.maximum;
  const fromPattern = pattern.digitSigns > 1 ? pattern.digitSigns : undefined;
  const fromWidth = widthMaximum === undefined ? undefined : Math.max(widthMaximum, minimum);
  const maximum = marker.width === undefined ? fromPattern : fromWidth;
  const kept = decimalDigits(maximum === undefined ? fraction : fraction.round(maximum, 'floor')).fraction;
  return reversed(formatDigits(reversed(kept), pattern, minimum));
}

/** A name, capitalized as the marker asks or by the component's default, fitted to its width. */
function writeNamed(value: NamedValue, marker: VariableMarker, context: RenderContext): string {
  const nameCase = isNameCase(marker.presentation)
    ? marker.presentation
    : (COMPONENT_RULES[marker.component].presentation as NameCase);
  return writeName(value, nameCase, marker.width, context.language);
}

/** A component that is a name when the marker asks for one, and else a number. */
function writeNameOrNumber(
  value: { readonly kind: 'month' | 'weekday'; readonly index: number },
  marker: VariableMarker,
  context: RenderContext
): string {
  const asName = isNameCase(marker.presentation) || (marker.presentation === undefined && marker.component === 'F');
  return asName ? writeNamed(value, marker, context) : writeNumber(BigInt(value.index), marker, context);
}

/** The year, month and day of a value that has a date. */
function dateOf(value: XMLGregorianCalendar): CivilDate {
  return { year: value.year as number, month: value.month as number, day: value.day as number };
}

/** The numeric components, each with the number it has in a value that has what it needs. */
const COMPONENT_NUMBERS: Partial<Record<Component, (value: XMLGregorianCalendar) => number>> = {
  Y: (value) => Math.abs(value.year as number),
  D: (value) => value.day as number,
  d: (value) => dayOfYear(dateOf(value)),
  W: (value) => weekOfYear(dateOf(value)),
  w: (value) => weekOfMonth(dateOf(value)),
  H: (value) => value.hour as number,
  h: (value) => {
    const hour = (value.hour as number) % HOURS_PER_HALF_DAY;
    return hour === 0 ? HOURS_PER_HALF_DAY : hour;
  },
  m: (value) => value.minute as number,
  s: (value) => value.second as number,
};

/** FOFD1350 unless a value has what a component needs. */
function checkAvailable(component: Component, value: XMLGregorianCalendar): void {
  const needs = COMPONENT_RULES[component].needs;
  if ((needs === 'date' && value.year === undefined) || (needs === 'time' && value.hour === undefined))
    dynamicError(XPathErrorCode.UNAVAILABLE_DATE_TIME_COMPONENT, `An xs:${value.kind} has no component [${component}]`);
}

/** A variable marker as it writes a date or time value; FOFD1350 for a component the value lacks. */
export function writeMarker(asWritten: VariableMarker, value: XMLGregorianCalendar, context: RenderContext): string {
  checkAvailable(asWritten.component, value);
  if (asWritten.component === 'Z' || asWritten.component === 'z') {
    const options = { gmt: asWritten.component === 'z', traditional: asWritten.traditional };
    return formatTimezone(value.timezone, asWritten.presentation, options);
  }
  const marker = supported(asWritten);
  switch (marker.component) {
    case 'f': {
      return writeFraction(value.fractionalSecond as Decimal, marker, context);
    }
    case 'P': {
      const half = (value.hour as number) < HOURS_PER_HALF_DAY ? AM : PM;
      return writeNamed({ kind: 'dayPeriod', index: half }, marker, context);
    }
    case 'E': {
      return writeNamed({ kind: 'text', text: (value.year as number) > 0 ? 'AD' : 'BC' }, marker, context);
    }
    case 'C': {
      return writeNamed({ kind: 'text', text: context.calendar }, marker, context);
    }
    case 'M': {
      return writeNameOrNumber({ kind: 'month', index: value.month as number }, marker, context);
    }
    case 'F': {
      return writeNameOrNumber({ kind: 'weekday', index: isoWeekday(dateOf(value)) }, marker, context);
    }
    default: {
      const number = COMPONENT_NUMBERS[marker.component] as (value: XMLGregorianCalendar) => number;
      return writeNumber(BigInt(number(value)), marker, context);
    }
  }
}
