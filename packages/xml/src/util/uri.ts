import { HEX_DIGITS_PER_BYTE } from '@/util/bytes';
import { Char, isSurrogate } from '@/util/chars';
import { upperHex } from '@/util/numbers';

/** The percent-escape of each ASCII character. */
const ASCII_ESCAPES = Array.from({ length: Char.NON_ASCII }, (_, code) => `%${upperHex(code, HEX_DIGITS_PER_BYTE)}`);

/** U+FFFD as percent-escaped UTF-8, which a lone surrogate becomes. */
const REPLACEMENT_ESCAPE = encodeURIComponent('\uFFFD');

/** A character as `%HH`, one per byte of its UTF-8; a lone surrogate as U+FFFD. */
export function percentEscape(character: string): string {
  const code = character.codePointAt(0) as number;
  const escape = ASCII_ESCAPES[code];
  if (escape !== undefined) return escape;
  // encodeURIComponent escapes a character's UTF-8 bytes, but throws for a lone surrogate.
  return isSurrogate(code) ? REPLACEMENT_ESCAPE : encodeURIComponent(character);
}

/**
 * The characters a URI reference may not hold as they are, as XML 1.1 §4.2.2 lists them: the controls
 * #x0-#x1F and #x7F, the space, `"`, `<`, `>`, `\`, `^`, `` ` ``, `{`, `|` and `}`, and everything above #x7F.
 */
// oxlint-disable-next-line no-control-regex -- finding control characters is the point
const NEEDS_ESCAPING = /[\u0000-\u0020"<>\\^`{|}\u007F-\u{10FFFF}]+/gu;

/** A run of characters to escape, at once unless it holds a lone surrogate; encodeURIComponent escapes them all. */
function escapeRun(run: string): string {
  try {
    return encodeURIComponent(run);
  } catch {
    return Array.from(run, percentEscape).join('');
  }
}

/** Escapes each character a URI reference may not hold as `%HH`, one per byte of its UTF-8. */
export function escapeURI(uri: string): string {
  return uri.replaceAll(NEEDS_ESCAPING, escapeRun);
}

/** Whether a URI reference is absolute, starting with a scheme such as `http:`. */
export function hasScheme(uri: string): boolean {
  return /^[A-Za-z][\d+.A-Za-z-]*:/.test(uri);
}

/** Resolves a URI against a base URI; undefined when there is no URI, or it can't be made absolute. */
export function resolveURI(uri: string | undefined, baseURI: string | undefined): string | undefined {
  if (uri === undefined) return undefined;
  try {
    return new URL(uri, baseURI).href;
  } catch {
    return undefined;
  }
}

/**
 * Escapes a URI reference, as XML Base and XML 1.1 §4.2.2 say, then resolves it against a base
 * URI; undefined when it can't be made absolute.
 */
export function escapeAndResolveURI(reference: string, baseURI: string | undefined): string | undefined {
  return resolveURI(escapeURI(reference), baseURI);
}

/** The target URI of a reference against a base URI (RFC 3986 §5), or the reference as written when it has none. */
export function resolveTargetURI(reference: string, baseURI: string | undefined): string {
  return resolveURI(reference, baseURI) ?? reference;
}

/** The target URI of a reference once escaped as XML Base says, or the reference as written when it has none. */
export function resolveEscapedTargetURI(reference: string, baseURI: string | undefined): string {
  return escapeAndResolveURI(reference, baseURI) ?? reference;
}

/** The scheme of an absolute URI, lower-cased, such as `https`, as access lists name it; `''` for a URI without one. */
export function protocolOf(uri: string): string {
  return uri.slice(0, Math.max(uri.indexOf(':'), 0)).toLowerCase();
}
