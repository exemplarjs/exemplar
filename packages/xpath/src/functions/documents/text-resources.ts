import { EMPTY_SEQUENCE, XdmAtomicValue, type XdmMap, type XdmValue } from '@exemplarjs/xdm';
import type { ResolvedSource } from '@exemplarjs/xml';
import {
  BYTE_MASK,
  BYTE_ORDER_MARK,
  Char,
  ErrorFactory,
  holdsNonChar,
  startsWithBytes,
} from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { absoluteURI, parseUri } from '@/functions/core/uri-resolution';
import { booleanResult, optionalString, stringResult } from '@/functions/core/values';
import { type FunctionDefinition, reading } from '@/functions/function-library';
import { jsonValue } from '@/functions/json/parse-json';
import { defineWithOptions } from '@/functions/options';
import { defineWithLast } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { after, type Pausable } from '@/runtime/pausing';
import { isAvailable, readingAs, sourceAt } from './documents.ts';

/** How many bytes at the start of a resource are searched for an XML declaration. */
const DECLARATION_SEARCH_LENGTH = 100;

/** The encoding a byte order mark at the start of bytes names, or undefined. */
function byteOrderMark(bytes: Uint8Array): string | undefined {
  if (startsWithBytes(bytes, BYTE_ORDER_MARK.UTF8)) return 'utf-8';
  if (startsWithBytes(bytes, BYTE_ORDER_MARK.UTF16BE)) return 'utf-16be';
  if (startsWithBytes(bytes, BYTE_ORDER_MARK.UTF16LE)) return 'utf-16le';
  return undefined;
}

/** The encoding an XML declaration at the start of ASCII-compatible bytes names, as a heuristic for XML resources. */
function declaredEncoding(bytes: Uint8Array): string | undefined {
  const head = String.fromCodePoint(...bytes.subarray(0, DECLARATION_SEARCH_LENGTH));
  return /^<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z][\w.-]*)["']/.exec(head)?.[1];
}

/**
 * The encoding to decode a resource's bytes in: the one the resource itself names (an HTTP charset,
 * say), else the one asked for, else what the bytes show, else UTF-8; a byte order mark settles UTF-16's byte order.
 */
function encodingOf(source: ResolvedSource, bytes: Uint8Array, asked: string | undefined): string {
  const mark = byteOrderMark(bytes);
  const chosen = (source.encoding ?? asked ?? mark ?? declaredEncoding(bytes) ?? 'utf-8').toLowerCase();
  if (chosen === 'utf-16' && mark?.startsWith('utf-16') === true) return mark;
  return chosen;
}

/** Bytes as Latin-1 or ASCII, each byte one character, which `TextDecoder` would read as windows-1252 instead. */
function singleByteText(bytes: Uint8Array, limit: number): string {
  let text = '';
  for (const byte of bytes) {
    if (byte > limit) throw ErrorFactory.create(RangeError, `The byte ${byte} is not in the encoding`);
    text += String.fromCodePoint(byte);
  }
  return text;
}

/** Decodes bytes in an encoding, failing on any byte sequence it does not allow; a byte order mark is left out. */
function decode(bytes: Uint8Array, encoding: string): string {
  if (encoding === 'iso-8859-1' || encoding === 'latin1') return singleByteText(bytes, BYTE_MASK);
  if (encoding === 'us-ascii' || encoding === 'ascii') return singleByteText(bytes, Char.DELETE);
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

/** Raises FOUT1190 for an encoding asked for that is not supported, whether or not the resource's own encoding wins. */
function checkEncoding(asked: string | undefined): void {
  if (asked === undefined) return;
  readingAs(XPathErrorCode.TEXT_NOT_DECODED, `The encoding ${asked} is not supported`, () =>
    decode(new Uint8Array(), asked.toLowerCase())
  );
}

/** A resource's text: as given, or its bytes decoded; FOUT1190 when they do not decode or hold characters XML cannot. */
function textOf(source: ResolvedSource, asked: string | undefined, uri: string): string {
  checkEncoding(asked);
  const bytes = source.bytes ?? new Uint8Array();
  const text =
    source.text ??
    readingAs(XPathErrorCode.TEXT_NOT_DECODED, `${uri} cannot be decoded`, () =>
      decode(bytes, encodingOf(source, bytes, asked))
    );
  if (holdsNonChar(text, false))
    return dynamicError(XPathErrorCode.TEXT_NOT_DECODED, `${uri} holds a character XML cannot hold`);
  return text;
}

/** A text resource's URI made absolute against the static base URI; FOUT1170 for one that is not valid or has a fragment. */
function textURI(href: string, context: DynamicContext): string {
  const uri = absoluteURI(href, context.environment.staticContext.baseURI);
  if (uri === undefined || parseUri(uri)?.fragment !== undefined)
    return dynamicError(
      XPathErrorCode.TEXT_NOT_READ,
      `"${href}" is not a valid URI without a fragment that can be made absolute`
    );
  return uri;
}

/** The text a URI names, decoded, read once in an evaluation for each encoding asked for. */
function textAt(href: string, encoding: string | undefined, context: DynamicContext): Pausable<string> {
  const uri = textURI(href, context);
  return context.environment.resources.answer(`text ${encoding ?? ''} ${uri}`, () =>
    after(sourceAt(uri, XPathErrorCode.TEXT_NOT_READ, context), (source) => textOf(source, encoding, uri))
  );
}

/** Text split into lines at each line feed, carriage return, or both together, without an empty last line. */
function linesOf(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** What a text function does with the text a URI names, and the encoding asked for. */
type TextImplementation = (href: string, encoding: string | undefined, context: DynamicContext) => Pausable<XdmValue>;

/** A text function defined with and without its `$encoding` argument; the empty sequence for an empty `$href`. */
function defineWithEncoding(
  signature: string,
  empty: XdmValue,
  implementation: TextImplementation
): FunctionDefinition[] {
  return defineWithLast(signature, '$encoding as xs:string', ([href], encoding, context) => {
    const uri = optionalString(href);
    return uri === undefined ? empty : implementation(uri, optionalString(encoding), context);
  }).map((definition) => reading(definition));
}

/** `fn:unparsed-text`, `fn:unparsed-text-lines` and `fn:unparsed-text-available` (F&O §14.8), and `fn:json-doc` (§17.5). */
export const TEXT_RESOURCE_FUNCTIONS: readonly FunctionDefinition[] = [
  ...defineWithEncoding(
    'fn:unparsed-text($href as xs:string?) as xs:string?',
    EMPTY_SEQUENCE,
    (href, encoding, context) => after(textAt(href, encoding, context), stringResult)
  ),
  ...defineWithEncoding(
    'fn:unparsed-text-lines($href as xs:string?) as xs:string*',
    EMPTY_SEQUENCE,
    (href, encoding, context) =>
      after(textAt(href, encoding, context), (text) => linesOf(text).map((line) => XdmAtomicValue.string(line)))
  ),
  ...defineWithEncoding(
    'fn:unparsed-text-available($href as xs:string?) as xs:boolean',
    booleanResult(false),
    (href, encoding, context) => isAvailable(() => textAt(href, encoding, context))
  ),
  ...defineWithOptions('fn:json-doc($href as xs:string?) as item()?', ([href], options: XdmMap, context) => {
    const uri = optionalString(href);
    return uri === undefined
      ? EMPTY_SEQUENCE
      : after(textAt(uri, undefined, context), (text) => jsonValue(text, options));
  }).map((definition) => reading(definition)),
];
