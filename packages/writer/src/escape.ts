import { ErrorCode } from '@exemplarjs/xml';
import {
  Char,
  codePointLabel,
  ErrorFactory,
  isChar,
  isRestrictedChar,
  SURROGATE_PAIR_LENGTH,
  Unicode,
} from '@exemplarjs/xml/internal';
import { unicodeEscape } from './encoders.ts';
import { WriterError } from './error.ts';

const { AMPERSAND, CARRIAGE_RETURN, DOUBLE_QUOTE, GREATER_THAN, LESS_THAN, LINE_FEED, LINE_SEPARATOR, NEXT_LINE, TAB } =
  Char;
const { SUPPLEMENTARY_FIRST } = Unicode;

/** How many characters `]]` takes, the start of the `]]>` that text must not hold. */
export const CDATA_BRACKETS_LENGTH = 2;

/** How text and attribute values are escaped for one writer. */
export interface EscapeOptions {
  /** Escape only what XML requires, rather than everything re-reading would change. */
  readonly minimal: boolean;
  /** Whether the document is XML 1.1, whose RestrictedChars, NEL and LS are written as references. */
  readonly version11: boolean;
  /** Matches a character the output encoding cannot hold. */
  readonly unencodable: RegExp | undefined;
  /** Throw on characters XML does not allow. */
  readonly checkCharacters: boolean;
  /** Characters written as the strings they map to, unescaped; none by default. */
  readonly characterMap?: ReadonlyMap<string, string>;
}

/** Escapes character data and attribute values. */
export interface Escaper {
  /** What it escapes for. */
  readonly options: EscapeOptions;

  /** Character data, escaped. */
  text(text: string): string;

  /** An attribute value, escaped for writing between double quotes. */
  attribute(value: string): string;
}

/** What XML 1.0 does not allow (XML 1.0 [2] Char). */
// oxlint-disable-next-line no-control-regex -- finding control characters is the point
const NOT_CHAR_XML_10 = /[\0-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/;
/** What XML 1.1 does not allow or writes as a reference: outside Char, RestrictedChar, NEL and LS (XML 1.1 [2], [2a]). */
// oxlint-disable-next-line no-control-regex -- finding control characters is the point
const SPECIAL_XML_11 = /[\0-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\uD800-\uDFFF\uFFFE\uFFFF]/;

/** Whether XML 1.1 needs a code point written as a reference: restricted characters, and NEL and LS, which re-reading treats as line ends. */
function needsReferenceXml11(code: number): boolean {
  return isRestrictedChar(code) || code === NEXT_LINE || code === LINE_SEPARATOR;
}

/** Whether markup, which cannot hold references, can hold a code point: in XML 1.1 no RestrictedChar. */
function allowedLiterally(code: number, version11: boolean): boolean {
  return isChar(code, version11) && !(version11 && isRestrictedChar(code));
}

/** A string as `\uXXXX` escapes of its code units, which a regular expression matches literally. */
function codeUnitEscapes(text: string): string {
  // eslint-disable-next-line prefer-code-point -- each code unit, a surrogate pair as two
  return Array.from({ length: text.length }, (_, index) => unicodeEscape(text.charCodeAt(index))).join('');
}

/** Builds the escaper for one writer's options. */
export function escaper(options: EscapeOptions): Escaper {
  const { minimal, version11, unencodable, checkCharacters, characterMap } = options;
  // The character class without its brackets.
  const special = (version11 ? SPECIAL_XML_11 : NOT_CHAR_XML_10).source.slice(1, -1);
  const mapped = [...(characterMap?.keys() ?? [])].map((char) => `|${codeUnitEscapes(char)}`).join('');
  const extraAlternatives = (unencodable === undefined ? '' : `|${unencodable.source}`) + mapped;
  // One test finds anything to escape, any character XML forbids, and any the encoding lacks.
  const textClass = minimal ? '[&<' + special + ']|]]>' : String.raw`[&<>\r` + special + ']';
  const attributeClass = minimal ? '[&<"' + special + ']' : String.raw`[&<"\t\n\r` + special + ']';
  const textNeedsEscaping = new RegExp(textClass + extraAlternatives);
  const valueNeedsEscaping = new RegExp(attributeClass + extraAlternatives);
  /** A character markup does not need escaped: as it is, refused, or a reference when XML 1.1 or the encoding needs one. */
  const escapeCharacter = (char: string, code: number): string => {
    if (!isChar(code, version11)) {
      if (checkCharacters) {
        throw ErrorFactory.create(
          WriterError,
          ErrorCode.WRITE_CHARACTER,
          `${codePointLabel(code)} is not allowed in XML`
        );
      }
      return char;
    }
    if ((version11 && needsReferenceXml11(code)) || (unencodable?.test(char) ?? false)) return `&#${code};`;
    return char;
  };
  /** A character of text escaped: `&` and `<`, `>` after `]]`, and in round-trip mode any `>` and CR. */
  const escapeInText = (char: string, code: number, text: string, index: number): string => {
    if (code === AMPERSAND) return '&amp;';
    if (code === LESS_THAN) return '&lt;';
    if (code === GREATER_THAN && (!minimal || text.slice(index - CDATA_BRACKETS_LENGTH, index) === ']]')) return '&gt;';
    if (code === CARRIAGE_RETURN && !minimal) return `&#${code};`;
    return escapeCharacter(char, code);
  };
  /** A character of an attribute value escaped: `&`, `<` and `"`, and in round-trip mode tab, LF and CR. */
  const escapeInValue = (char: string, code: number): string => {
    if (code === AMPERSAND) return '&amp;';
    if (code === LESS_THAN) return '&lt;';
    if (code === DOUBLE_QUOTE) return '&quot;';
    if (!minimal && (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN)) return `&#${code};`;
    return escapeCharacter(char, code);
  };
  return {
    options,
    text: (text) => (textNeedsEscaping.test(text) ? mapCharacters(text, characterMap, escapeInText) : text),
    attribute: (value) => (valueNeedsEscaping.test(value) ? mapCharacters(value, characterMap, escapeInValue) : value),
  };
}

/** Writes a character the character map does not map, given its code point, the text, and its offset there. */
export type CharacterWriter = (char: string, code: number, text: string, index: number) => string;

/**
 * Writes each character as the character map maps it, else as `other` writes it (unchanged by default);
 * a surrogate pair counts as one character. XSLT's character maps, for an output method that writes its own text.
 *
 * @example
 * mapCharacters('a-b', new Map([['-', '&#x2D;']])); // 'a&#x2D;b'
 */
export function mapCharacters(
  text: string,
  characterMap: ReadonlyMap<string, string> | undefined,
  other?: CharacterWriter
): string {
  if (other === undefined && (characterMap === undefined || characterMap.size === 0)) return text;
  let written = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i) as number;
    const char = code >= SUPPLEMENTARY_FIRST ? text.slice(i, i + SURROGATE_PAIR_LENGTH) : (text[i] as string);
    const mapped = characterMap?.get(char);
    if (mapped === undefined) written += other === undefined ? char : other(char, code, text, i);
    else written += mapped;
    i += char.length - 1;
  }
  return written;
}

/** Throws when markup that cannot hold references holds a character XML or the encoding does not allow. */
export function checkLiteral(text: string, options: EscapeOptions, what: string): void {
  const special = options.version11 ? SPECIAL_XML_11 : NOT_CHAR_XML_10;
  const unencodable = options.unencodable?.exec(text);
  if (unencodable) {
    const code = text.codePointAt(unencodable.index) as number;
    throw ErrorFactory.create(
      WriterError,
      ErrorCode.WRITE_ENCODING,
      `${codePointLabel(code)} cannot be written in ${what} in this encoding`
    );
  }
  if (!options.checkCharacters || !special.test(text)) return;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i) as number;
    if (code >= SUPPLEMENTARY_FIRST) i++;
    if (!allowedLiterally(code, options.version11)) {
      throw ErrorFactory.create(
        WriterError,
        ErrorCode.WRITE_CHARACTER,
        `${codePointLabel(code)} is not allowed in ${what}`
      );
    }
  }
}

/** A literal in whichever quotes it does not hold, as a DOCTYPE's identifiers are written. */
export function quotedLiteral(literal: string): string {
  return literal.includes('"') ? `'${literal}'` : `"${literal}"`;
}

/** A DOCTYPE declaration: a name, an external identifier if there is a system or public id, and an internal subset if given. */
export function doctypeDeclaration(
  name: string,
  publicId: string | null | undefined,
  systemId: string | null | undefined,
  internalSubset?: string | null
): string {
  let declaration = `<!DOCTYPE ${name}`;
  if (publicId) declaration += ` PUBLIC ${quotedLiteral(publicId)} ${quotedLiteral(systemId ?? '')}`;
  else if (systemId) declaration += ` SYSTEM ${quotedLiteral(systemId)}`;
  if (internalSubset) declaration += ` [${internalSubset}]`;
  return `${declaration}>`;
}

/** Text as CDATA sections, split around `]]>`. */
export function cdataSections(text: string): string {
  return `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

/** Text as CDATA sections, with the characters an encoding lacks as references between them. */
export function cdataSectionsAround(text: string, unencodable: RegExp): string {
  let written = '';
  let run = '';
  for (const char of text) {
    if (!unencodable.test(char)) {
      run += char;
      continue;
    }
    if (run !== '') written += cdataSections(run);
    written += `&#${char.codePointAt(0) as number};`;
    run = '';
  }
  return run === '' ? written : written + cdataSections(run);
}
