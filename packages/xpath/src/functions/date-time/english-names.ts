/** The English month names, January first. */
export const ENGLISH_MONTHS: readonly string[] =
  'January February March April May June July August September October November December'.split(' ');

/** The English weekday names, Monday first. */
export const ENGLISH_WEEKDAYS: readonly string[] = 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday'.split(
  ' '
);

/** The length of the usual English abbreviations of months and weekdays, such as `Jan` and `Mon`. */
export const ABBREVIATION_LENGTH = 3;

/** A month or weekday name's usual English abbreviation, such as `Jan` for `January`. */
export function abbreviation(name: string): string {
  return name.slice(0, ABBREVIATION_LENGTH);
}
