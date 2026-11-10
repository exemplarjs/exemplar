import {
  EMPTY_SEQUENCE,
  isAtomicValue,
  isNode,
  type XdmAtomicValue,
  type XdmItem,
  type XdmValue,
} from '@exemplarjs/xdm';
import {
  Char,
  collapseWhitespace,
  escapeURI,
  isChar,
  percentEscape,
  splitWhitespace,
  trimWhitespace,
} from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { Collation } from '@/functions/collations/collation';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction, defineWithLast } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';
import {
  booleanResult,
  characterCount,
  characters,
  defineWithCollation,
  integerResult,
  optionalString,
  roundedSlice,
  stringArgument,
  stringResult,
} from './values.ts';

/** The string value of an item: a node's string value, an atomic value cast to a string; FOTY0014 for a function item. */
export function stringValueOf(item: XdmItem): string {
  if (isAtomicValue(item)) return item.stringValue;
  if (isNode(item)) return item.stringValue;
  return dynamicError(XPathErrorCode.FUNCTION_HAS_NO_STRING, 'A function item has no string value');
}

/** `fn:string`: the string value of an item, `''` for none. */
function stringOf(value: XdmValue): XdmValue {
  const item = value[0];
  return stringResult(item === undefined ? '' : stringValueOf(item));
}

/** The string of the context item, for the forms of the string functions without an argument. */
function contextString(context: DynamicContext): string {
  return stringValueOf(context.contextItem());
}

/** A function of a string, with a form without arguments that takes the context item's string value. */
function stringFunction(name: string, returnType: string, operation: (text: string) => XdmValue): FunctionDefinition[] {
  return [
    defineFunction(`fn:${name}() as ${returnType}`, (_, context) => operation(contextString(context))),
    defineFunction(`fn:${name}($arg as xs:string?) as ${returnType}`, ([text]) => operation(stringArgument(text))),
  ];
}

/** Text in upper or lower case, character by character, without the context-sensitive rules such as the final sigma. */
function mapCase(text: string, upper: boolean): string {
  return characters(text)
    .map((character) => (upper ? character.toUpperCase() : character.toLowerCase()))
    .join('');
}

/** `fn:substring`: the characters from a rounded start for a rounded length, counted in code points. */
function substring(text: string, startValue: XdmValue | undefined, lengthValue: XdmValue | undefined): string {
  return roundedSlice(characters(text), startValue, lengthValue).join('');
}

/** `fn:translate`: each character in the map replaced by the one at its place in the translation, or removed when there is none. */
function translate(text: string, map: string, translation: string): string {
  const from = characters(map);
  const to = characters(translation);
  return characters(text)
    .map((character) => {
      const index = from.indexOf(character);
      if (index === -1) return character;
      return to[index] ?? '';
    })
    .join('');
}

/** `fn:codepoints-to-string`; FOCH0001 for a code point that is not an XML character. */
function codepointsToString(value: XdmValue): string {
  return value
    .map((item) => {
      const codePoint = Number((item as XdmAtomicValue).value);
      if (!isChar(codePoint, false))
        return dynamicError(XPathErrorCode.INVALID_CODE_POINT, `${codePoint} is not a valid XML character`);
      return String.fromCodePoint(codePoint);
    })
    .join('');
}

/** `fn:normalize-unicode`: NFC by default, or the form named; FOCH0003 for a form not supported. */
function normalizeUnicode(text: string, formValue: XdmValue | undefined): string {
  const form = formValue === undefined ? 'NFC' : trimWhitespace(stringArgument(formValue)).toUpperCase();
  if (form === '') return text;
  if (form !== 'NFC' && form !== 'NFD' && form !== 'NFKC' && form !== 'NFKD')
    return dynamicError(
      XPathErrorCode.UNSUPPORTED_NORMALIZATION_FORM,
      `The normalization form ${form} is not supported`
    );
  return text.normalize(form);
}

/** Percent-encodes the characters of a string that a test says to, as `encode-for-uri` and `escape-html-uri` do. */
function percentEncode(text: string, encodes: (character: string) => boolean): string {
  return Array.from(text, (character) => (encodes(character) ? percentEscape(character) : character)).join('');
}

/** The characters `encode-for-uri` leaves as they are. */
const URI_UNRESERVED = /^[A-Za-z0-9\-_.~]$/;

/** Whether `escape-html-uri` encodes a character: any outside printable ASCII. */
function htmlEncodes(character: string): boolean {
  const codePoint = character.codePointAt(0) as number;
  return codePoint < Char.SPACE || codePoint > Char.TILDE;
}

/** A URI with the characters outside printable ASCII percent-encoded, as `escape-html-uri` and the HTML serializer do. */
export function escapeHtmlUri(uri: string): string {
  return percentEncode(uri, htmlEncodes);
}

/** A function of two optional strings that finds the second in the first, by the collation, with and without a collation argument. */
function withCollation(
  name: string,
  returnType: string,
  operation: (text: string, search: string, collation: Collation) => XdmValue
): FunctionDefinition[] {
  return defineWithCollation(
    `${name}($arg1 as xs:string?, $arg2 as xs:string?) as ${returnType}`,
    ([text, search], _, collation) => operation(stringArgument(text), stringArgument(search), collation)
  );
}

/** The functions on strings (F&O §5). */
export const STRING_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:string() as xs:string', (_, context) => stringResult(contextString(context))),
  defineFunction('fn:string($arg as item()?) as xs:string', ([value = []]) => stringOf(value)),
  ...stringFunction('string-length', 'xs:integer', (text) => integerResult(characterCount(text))),
  ...stringFunction('normalize-space', 'xs:string', (text) => stringResult(collapseWhitespace(text))),
  defineFunction('fn:concat($arg1 as xs:anyAtomicType?, $arg2 as xs:anyAtomicType?, ...) as xs:string', (args) =>
    stringResult(args.map((arg) => (arg[0] === undefined ? '' : stringValueOf(arg[0]))).join(''))
  ),
  ...defineWithLast(
    'fn:string-join($arg1 as xs:anyAtomicType*) as xs:string',
    '$arg2 as xs:string',
    ([items = []], separator) => stringResult(items.map((item) => stringValueOf(item)).join(stringArgument(separator)))
  ),
  ...defineWithLast(
    'fn:substring($sourceString as xs:string?, $start as xs:double) as xs:string',
    '$length as xs:double',
    ([text, start], length) => stringResult(substring(stringArgument(text), start, length))
  ),
  ...withCollation('fn:contains', 'xs:boolean', (text, search, collation) =>
    booleanResult(collation.find(text, search, 'anywhere') !== undefined)
  ),
  ...withCollation('fn:starts-with', 'xs:boolean', (text, search, collation) =>
    booleanResult(collation.find(text, search, 'start') !== undefined)
  ),
  ...withCollation('fn:ends-with', 'xs:boolean', (text, search, collation) =>
    booleanResult(collation.find(text, search, 'end') !== undefined)
  ),
  ...withCollation('fn:substring-before', 'xs:string', (text, search, collation) => {
    const match = collation.find(text, search, 'anywhere');
    return stringResult(match === undefined ? '' : text.slice(0, match.index));
  }),
  ...withCollation('fn:substring-after', 'xs:string', (text, search, collation) => {
    const match = collation.find(text, search, 'anywhere');
    return stringResult(match === undefined ? '' : text.slice(match.index + match.length));
  }),
  defineFunction('fn:upper-case($arg as xs:string?) as xs:string', ([text]) =>
    stringResult(mapCase(stringArgument(text), true))
  ),
  defineFunction('fn:lower-case($arg as xs:string?) as xs:string', ([text]) =>
    stringResult(mapCase(stringArgument(text), false))
  ),
  defineFunction(
    'fn:translate($arg as xs:string?, $mapString as xs:string, $transString as xs:string) as xs:string',
    ([text, map, to]) => stringResult(translate(stringArgument(text), stringArgument(map), stringArgument(to)))
  ),
  defineFunction('fn:codepoints-to-string($arg as xs:integer*) as xs:string', ([codes = []]) =>
    stringResult(codepointsToString(codes))
  ),
  defineFunction('fn:string-to-codepoints($arg as xs:string?) as xs:integer*', ([text]) =>
    characters(stringArgument(text)).flatMap((character) => integerResult(character.codePointAt(0) as number))
  ),
  ...defineWithCollation(
    'fn:compare($comparand1 as xs:string?, $comparand2 as xs:string?) as xs:integer?',
    ([comparand1, comparand2], _, collation) => {
      const first = optionalString(comparand1);
      const second = optionalString(comparand2);
      if (first === undefined || second === undefined) return EMPTY_SEQUENCE;
      return integerResult(Math.sign(collation.compare(first, second)));
    }
  ),
  defineFunction(
    'fn:codepoint-equal($comparand1 as xs:string?, $comparand2 as xs:string?) as xs:boolean?',
    ([comparand1, comparand2]) => {
      const first = optionalString(comparand1);
      const second = optionalString(comparand2);
      if (first === undefined || second === undefined) return EMPTY_SEQUENCE;
      return booleanResult(first === second);
    }
  ),
  ...defineWithCollation(
    'fn:contains-token($input as xs:string*, $token as xs:string) as xs:boolean',
    ([input = [], token], _, collation) => {
      const wanted = trimWhitespace(stringArgument(token));
      if (wanted === '') return booleanResult(false);
      const matches = (word: string): boolean => collation.compare(word, wanted) === 0;
      return booleanResult(
        input.some((item) => splitWhitespace(String((item as XdmAtomicValue).value)).some((word) => matches(word)))
      );
    }
  ),
  ...defineWithLast(
    'fn:normalize-unicode($arg as xs:string?) as xs:string',
    '$normalizationForm as xs:string',
    ([text], form) => stringResult(normalizeUnicode(stringArgument(text), form))
  ),
  defineFunction('fn:encode-for-uri($uri-part as xs:string?) as xs:string', ([text]) =>
    stringResult(percentEncode(stringArgument(text), (character) => !URI_UNRESERVED.test(character)))
  ),
  defineFunction('fn:iri-to-uri($iri as xs:string?) as xs:string', ([text]) =>
    stringResult(escapeURI(stringArgument(text)))
  ),
  defineFunction('fn:escape-html-uri($uri as xs:string?) as xs:string', ([text]) =>
    stringResult(escapeHtmlUri(stringArgument(text)))
  ),
];
