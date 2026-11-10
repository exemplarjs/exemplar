import { MINUTES_PER_HOUR, twoDigits } from '@exemplarjs/xdm/internal';
import { characters } from '@/functions/core/values';
import { familyZero, inFamily, isDecimalDigit } from './digit-families.ts';

/**
 * The `Z` and `z` components of `format-date` and its kin (F&O §9.8.4.6): a timezone as an offset
 * from UTC, shaped by the digits of the presentation modifier.
 *
 * - `01:01`, the default, or any digits around one separator: hours and minutes, `+05:30`;
 * - one or two digits, `0` or `00`: hours, then minutes only when there are some, `+5`, `+05:30`;
 * - three or four digits, `000` or `0000`: hours and minutes together, `+530`, `+0530`;
 * - `Z`: the military letter, `Z` for UTC and `J` for no timezone, or digits for an offset that has no letter.
 *
 * The second modifier `t` writes UTC as `Z`, and `z` puts `GMT` first. A value without a
 * timezone writes nothing, except with `Z`.
 */

/** The default shape, hours and minutes with a colon. */
const DEFAULT_SHAPE = '01:01';

/** The digits the minutes take in a shape of three or four digits; a shorter shape is hours only. */
const MINUTE_DIGITS = 2;

/** The military letters for offsets of one to twelve hours east, and west, of UTC. */
const MILITARY_EAST = 'ABCDEFGHIKLM';
const MILITARY_WEST = 'NOPQRSTUVWXY';

/** The military letter for a timezone, or undefined for an offset that is not a whole number of hours with a letter. */
function militaryLetter(offset: number | undefined): string | undefined {
  if (offset === undefined) return 'J';
  if (offset === 0) return 'Z';
  const hours = Math.abs(offset) / MINUTES_PER_HOUR;
  const letters = offset > 0 ? MILITARY_EAST : MILITARY_WEST;
  if (!Number.isInteger(hours) || hours > letters.length) return undefined;
  return letters[hours - 1];
}

/** The offset's hours and minutes in ASCII digits, as a shape of digits and at most one separator lays them out. */
function shapedOffset(hours: number, minutes: number, shape: string): string {
  const chars = characters(shape);
  const separatorAt = chars.findIndex((character) => !isDecimalDigit(character));
  const minuteText = twoDigits(minutes);
  if (separatorAt !== -1) {
    return `${String(hours).padStart(separatorAt, '0')}${chars[separatorAt] as string}${minuteText}`;
  }
  if (chars.length <= MINUTE_DIGITS) {
    const hourText = String(hours).padStart(chars.length, '0');
    return minutes === 0 ? hourText : `${hourText}:${minuteText}`;
  }
  return `${String(hours).padStart(chars.length - MINUTE_DIGITS, '0')}${minuteText}`;
}

/**
 * A timezone, in minutes east of UTC, as a `Z` or `z` marker writes it.
 *
 * @example
 * formatTimezone(330, '0', { gmt: false, traditional: false }); // '+5:30'
 * formatTimezone(-300, undefined, { gmt: true, traditional: false }); // 'GMT-05:00'
 */
export function formatTimezone(
  offset: number | undefined,
  presentation: string | undefined,
  options: { readonly gmt: boolean; readonly traditional: boolean }
): string {
  if (presentation === 'Z') {
    const letter = militaryLetter(offset);
    if (letter !== undefined) return letter;
  }
  if (offset === undefined) return '';
  if (options.traditional && offset === 0) return 'Z';
  const startsWithDigit = presentation !== undefined && isDecimalDigit(characters(presentation)[0] as string);
  const shape = startsWithDigit ? presentation : DEFAULT_SHAPE;
  const magnitude = Math.abs(offset);
  const digits = shapedOffset(Math.floor(magnitude / MINUTES_PER_HOUR), magnitude % MINUTES_PER_HOUR, shape);
  const zero = familyZero(characters(shape)[0] as string);
  return `${options.gmt ? 'GMT' : ''}${offset < 0 ? '-' : '+'}${inFamily(digits, zero)}`;
}
