import { LruCache, resolveTargetURI } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { CompilerStateKey } from '@/static/compiler-state';
import {
  CODEPOINT_COLLATION,
  codepointCollation,
  type Collation,
  HTML_ASCII_CASE_INSENSITIVE_COLLATION,
  htmlAsciiCaseInsensitiveCollation,
} from './collation.ts';
import { UCA_COLLATION, ucaCollation } from './uca-collation.ts';

/** How many UCA collations a compiler caches. */
const UCA_CAPACITY = 100;

/**
 * The collations a compiler's expressions name by URI. A UCA collation is made once for each URI,
 * as making one is slow, and held for as long as the compiler is.
 */
export class Collations {
  readonly #uca = new LruCache<string, Collation>(UCA_CAPACITY);

  /**
   * The collation a URI names, resolved against the static base URI when it is relative: the
   * codepoint collation, the HTML ASCII case-insensitive one, or a UCA collation with its
   * parameters; FOCH0002 for any other.
   */
  resolve(uri: string, baseURI: string | undefined): Collation {
    // The codepoint URI is absolute, so it needs no resolving.
    if (uri === CODEPOINT_COLLATION) return codepointCollation;
    const absolute = resolveTargetURI(uri, baseURI);
    if (absolute === CODEPOINT_COLLATION) return codepointCollation;
    if (absolute === HTML_ASCII_CASE_INSENSITIVE_COLLATION) return htmlAsciiCaseInsensitiveCollation;
    if (absolute === UCA_COLLATION || absolute.startsWith(`${UCA_COLLATION}?`)) {
      return this.#uca.computeIfAbsent(absolute, ucaCollation);
    }
    return dynamicError(XPathErrorCode.UNSUPPORTED_COLLATION, `The collation ${uri} is not supported`);
  }
}

/** A compiler's collations. */
export const COLLATIONS: CompilerStateKey<Collations> = { make: () => new Collations() };
