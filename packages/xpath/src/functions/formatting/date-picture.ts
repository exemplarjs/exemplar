import { WHITESPACE_CLASS } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { FORMAT_MODIFIER } from './integer-format.ts';

/**
 * The picture of `format-date` and its kin (F&O §9.8.4): literal text and variable markers such
 * as `[D01]` or `[MNn,3-3]`, with `[[` and `]]` for literal brackets. A marker is a component
 * specifier, then optionally a first presentation modifier (`01`, `Nn`, `I`), a second one as
 * `format-integer` reads it (`o`, `o(-e)`, `t`, `ot`), and a width modifier after the last comma
 * (`,3-3`, `,2-*`).
 * Whitespace inside a marker is ignored.
 *
 * @example
 * parseDatePicture('[D1o] of [MNn]');
 * // [{ component: 'D', presentation: '1', ordinal: true, … }, ' of ', { component: 'M', presentation: 'Nn', … }]
 */
export type PicturePart = string | VariableMarker;

/** The component specifiers, each naming a part of a date or time. */
export type Component =
  | 'Y'
  | 'M'
  | 'D'
  | 'd'
  | 'F'
  | 'W'
  | 'w'
  | 'H'
  | 'h'
  | 'P'
  | 'm'
  | 's'
  | 'f'
  | 'Z'
  | 'z'
  | 'C'
  | 'E';

/** A width modifier's bounds; `*` or an absent maximum leaves a bound undefined. */
export interface WidthModifier {
  readonly minimum: number | undefined;
  readonly maximum: number | undefined;
}

/** One variable marker of a picture. */
export interface VariableMarker {
  readonly component: Component;
  /** The first presentation modifier, or undefined for the component's default. */
  readonly presentation: string | undefined;
  /** Whether the second modifier asks for an ordinal, `o`, and for the traditional form, `t`. */
  readonly ordinal: boolean;
  readonly traditional: boolean;
  readonly width: WidthModifier | undefined;
}

const COMPONENTS: ReadonlySet<string> = new Set('YMDdFWwHhPmsfZzCE');

/** The length of a doubled `[[` or `]]`, which stands for one bracket. */
const DOUBLED_BRACKET_LENGTH = 2;

/** Modifiers split into the first, never empty, and the second, a format modifier as `format-integer` reads it. */
const MODIFIERS = new RegExp(`^(.+?)(${FORMAT_MODIFIER})$`);

/** A width modifier: a minimum, `*` or digits, and optionally `-` and a maximum. */
const WIDTH_MODIFIER = /^(\*|\d+)(?:-(\*|\d+))?$/;

/** Whitespace, which a marker ignores. */
const WHITESPACE = new RegExp(WHITESPACE_CLASS, 'g');

/** FODF1340 for a picture that breaks a rule. */
function invalidDatePicture(reason: string): never {
  return dynamicError(XPathErrorCode.INVALID_DATE_TIME_PICTURE, reason);
}

/** A bound of a width modifier: undefined for `*` or when absent; FOFD1340 for zero. */
function widthBound(text: string | undefined): number | undefined {
  if (text === undefined || text === '*') return undefined;
  const bound = Number(text);
  if (bound < 1) invalidDatePicture(`A width of ${text} is less than one`);
  return bound;
}

/** Reads a width modifier such as `3-3` or `2-*`; FOFD1340 when it is not one or its maximum is below its minimum. */
function parseWidth(text: string): WidthModifier {
  const match = WIDTH_MODIFIER.exec(text);
  if (match === null) return invalidDatePicture(`'${text}' is not a width modifier`);
  const minimum = widthBound(match[1]);
  const maximum = widthBound(match[2]);
  if (minimum !== undefined && maximum !== undefined && maximum < minimum)
    invalidDatePicture(`The width modifier '${text}' has a maximum below its minimum`);
  return { minimum, maximum };
}

/** Reads the inside of a marker, its whitespace removed; FOFD1340 for an unknown component or a bad width. */
function parseMarker(text: string): VariableMarker {
  const content = text.replaceAll(WHITESPACE, '');
  const component = content[0];
  if (component === undefined || !COMPONENTS.has(component))
    return invalidDatePicture(`'[${text}]' has no known component`);
  const comma = content.lastIndexOf(',');
  const modifiers = comma === -1 ? content.slice(1) : content.slice(1, comma);
  const width = comma === -1 ? undefined : parseWidth(content.slice(comma + 1));
  const [, presentation, second = ''] = MODIFIERS.exec(modifiers) ?? [];
  return {
    component: component as Component,
    presentation,
    ordinal: second.startsWith('o'),
    traditional: second.endsWith('t'),
    width,
  };
}

/** Reads a picture into literal text and markers; FOFD1340 for an unclosed marker or a lone `]`. */
export function parseDatePicture(picture: string): PicturePart[] {
  const parts: PicturePart[] = [];
  let literal = '';
  let index = 0;
  while (index < picture.length) {
    const character = picture[index] as string;
    const doubled = picture[index + 1] === character;
    if ((character === '[' || character === ']') && doubled) {
      literal += character;
      index += DOUBLED_BRACKET_LENGTH;
    } else if (character === '[') {
      const close = picture.indexOf(']', index);
      if (close === -1) invalidDatePicture(`The picture '${picture}' has a '[' without a ']'`);
      if (literal !== '') parts.push(literal);
      literal = '';
      parts.push(parseMarker(picture.slice(index + 1, close)));
      index = close + 1;
    } else if (character === ']') {
      invalidDatePicture(`The picture '${picture}' has a ']' that closes no marker`);
    } else {
      literal += character;
      index++;
    }
  }
  if (literal !== '') parts.push(literal);
  return parts;
}
