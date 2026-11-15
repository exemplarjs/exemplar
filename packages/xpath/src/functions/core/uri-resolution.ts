/** The parts of a URI reference (RFC 3986 §3); undefined for a part that is absent. */
interface UriParts {
  readonly scheme: string | undefined;
  readonly authority: string | undefined;
  readonly path: string;
  readonly query: string | undefined;
  readonly fragment: string | undefined;
}

/** A URI's scheme and its colon. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** What starts an authority, and the `.` and `..` segments RFC 3986 removes from a path. */
const AUTHORITY_START = '//';
const CURRENT_SEGMENT = '/./';
const PARENT_SEGMENT = '/../';

/** A percent sign not followed by two hexadecimal digits. */
const BAD_ESCAPE = /%(?![0-9A-Fa-f]{2})/;

/** Text split at the first of a character: before it, and after it or undefined when it is absent. */
function splitAt(text: string, character: string): [string, string | undefined] {
  const index = text.indexOf(character);
  return index === -1 ? [text, undefined] : [text.slice(0, index), text.slice(index + 1)];
}

/**
 * A URI reference's parts (RFC 3986 Appendix B), allowing spaces and non-ASCII as LEIRIs do; undefined
 * for a bad percent-escape or a relative path whose first segment holds a colon.
 */
export function parseUri(text: string): UriParts | undefined {
  if (BAD_ESCAPE.test(text)) return undefined;
  const schemeMatch = SCHEME.exec(text);
  const scheme = schemeMatch === null ? undefined : schemeMatch[0].slice(0, -1);
  const [beforeFragment, fragment] = splitAt(text.slice(schemeMatch?.[0].length ?? 0), '#');
  const [hierarchy, query] = splitAt(beforeFragment, '?');
  let authority: string | undefined;
  let path = hierarchy;
  if (hierarchy.startsWith(AUTHORITY_START)) {
    const slash = hierarchy.indexOf('/', AUTHORITY_START.length);
    const authorityEnd = slash === -1 ? hierarchy.length : slash;
    authority = hierarchy.slice(AUTHORITY_START.length, authorityEnd);
    path = slash === -1 ? '' : hierarchy.slice(slash);
  }
  if (scheme === undefined && authority === undefined && (path.split('/')[0] as string).includes(':')) return undefined;
  return { scheme, authority, path, query, fragment };
}

/** A path with its `.` and `..` segments removed, step by step as RFC 3986 §5.2.4 gives the algorithm. */
function removeDotSegments(path: string): string {
  let input = path;
  let output = '';
  while (input !== '') {
    if (input.startsWith('../') || input.startsWith('./')) input = input.slice(input.indexOf('/') + 1);
    else if (input.startsWith(CURRENT_SEGMENT) || input === '/.') input = `/${input.slice(CURRENT_SEGMENT.length)}`;
    else if (input.startsWith(PARENT_SEGMENT) || input === '/..') {
      input = `/${input.slice(PARENT_SEGMENT.length)}`;
      output = output.slice(0, Math.max(output.lastIndexOf('/'), 0));
    } else if (input === '.' || input === '..') input = '';
    else {
      // Moves the first segment, with any slash before it, to the output.
      const next = input.indexOf('/', 1);
      const end = next === -1 ? input.length : next;
      output += input.slice(0, end);
      input = input.slice(end);
    }
  }
  return output;
}

/** Two paths merged: the reference's path in place of the base path's last segment (§5.2.3). */
function merge(base: UriParts, path: string): string {
  if (base.authority !== undefined && base.path === '') return `/${path}`;
  const slash = base.path.lastIndexOf('/');
  return base.path.slice(0, slash + 1) + path;
}

/** A URI written back from its parts (§5.3); resolution always gives it a scheme. */
function recompose(parts: UriParts): string {
  let text = `${parts.scheme as string}:`;
  if (parts.authority !== undefined) text += `//${parts.authority}`;
  text += parts.path;
  if (parts.query !== undefined) text += `?${parts.query}`;
  if (parts.fragment !== undefined) text += `#${parts.fragment}`;
  return text;
}

/**
 * A URI reference made absolute against a base, as `resolve-uri` makes it; undefined when it is not
 * a URI, or is relative with no absolute base without a fragment to resolve it against.
 */
export function absoluteURI(reference: string, base: string | undefined): string | undefined {
  const parts = parseUri(reference);
  if (parts === undefined) return undefined;
  if (parts.scheme !== undefined) return reference;
  const baseParts = base === undefined ? undefined : parseUri(base);
  if (baseParts?.scheme === undefined || baseParts.fragment !== undefined) return undefined;
  return resolveReference(parts, baseParts);
}

/** A reference resolved against an absolute base (RFC 3986 §5.2.2). */
export function resolveReference(reference: UriParts, base: UriParts): string {
  if (reference.scheme !== undefined) return recompose({ ...reference, path: removeDotSegments(reference.path) });
  const { fragment } = reference;
  if (reference.authority !== undefined)
    return recompose({ ...reference, scheme: base.scheme, path: removeDotSegments(reference.path) });
  if (reference.path === '') {
    return recompose({ ...base, query: reference.query ?? base.query, fragment });
  }
  const path = reference.path.startsWith('/') ? reference.path : merge(base, reference.path);
  return recompose({ ...base, path: removeDotSegments(path), query: reference.query, fragment });
}
