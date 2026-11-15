import { remembered, resolveTargetURI } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import {
  CODEPOINT_COLLATION,
  codepointCollation,
  type Collation,
  HTML_ASCII_CASE_INSENSITIVE_COLLATION,
  htmlAsciiCaseInsensitiveCollation,
} from './collation.ts';
import { UCA_COLLATION, ucaCollation } from './uca-collation.ts';

/** The collation a UCA URI names, kept for a URI given again. */
const ucaCollationAt = remembered(ucaCollation);

/**
 * The collation a URI names, resolved against the static base URI when it is relative: the
 * codepoint collation, the HTML ASCII case-insensitive one, or a UCA collation with its
 * parameters; FOCH0002 for any other.
 */
export function resolveCollation(uri: string, baseURI: string | undefined): Collation {
  // The codepoint URI is absolute, so it needs no resolving.
  if (uri === CODEPOINT_COLLATION) return codepointCollation;
  const absolute = resolveTargetURI(uri, baseURI);
  if (absolute === CODEPOINT_COLLATION) return codepointCollation;
  if (absolute === HTML_ASCII_CASE_INSENSITIVE_COLLATION) return htmlAsciiCaseInsensitiveCollation;
  if (absolute === UCA_COLLATION || absolute.startsWith(`${UCA_COLLATION}?`)) {
    return ucaCollationAt(absolute);
  }
  return dynamicError(XPathErrorCode.UNSUPPORTED_COLLATION, `The collation ${uri} is not supported`);
}
