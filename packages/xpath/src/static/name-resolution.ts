import { isNcName, lexicalQNameParts, XMLNS_NAMESPACE } from '@exemplarjs/xml/internal';
import { XPathErrorCode, xpathError } from '@/api/xpath-exception';
import type { Span, UnresolvedName } from '@/syntax/syntax-tree';
import { FN_NAMESPACE, type NamespaceContext } from './static-context.ts';

/** A name resolved to its namespace URI (`''` for none), with the prefix it was written with. */
export interface ResolvedName {
  readonly namespaceURI: string;
  readonly localName: string;
  readonly prefix: string;
}

/** An EQName written `Q{uri}local`. */
const BRACED_NAME = /^Q\{([^{}]*)\}(.*)$/;

/** The parts of a name written as text: `Q{uri}local` gives its URI, a lexical QName its prefix; undefined for neither. */
export function splitEQName(
  text: string
): { readonly uri?: string; readonly prefix: string; readonly localName: string } | undefined {
  const braced = BRACED_NAME.exec(text);
  if (braced === null) {
    const parts = lexicalQNameParts(text);
    return parts === undefined ? undefined : { prefix: parts[0], localName: parts[1] };
  }
  const localName = braced[2] as string;
  return isNcName(localName) ? { uri: braced[1] as string, prefix: '', localName } : undefined;
}

/** The namespace a prefix is bound to; raises XPST0081 where the prefix was written when none is. */
export function namespaceOf(prefix: string, name: Span, context: NamespaceContext): string {
  const namespaceURI = context.resolvePrefix(prefix);
  if (namespaceURI === undefined)
    xpathError(XPathErrorCode.UNBOUND_PREFIX, `The prefix "${prefix}" is not bound to a namespace`, name, context.text);
  return namespaceURI;
}

/** A resolved name, checked to be outside the xmlns namespace (XQST0070 where it was written). */
function outsideXmlns(resolved: ResolvedName, name: Span, context: NamespaceContext): ResolvedName {
  if (resolved.namespaceURI === XMLNS_NAMESPACE)
    xpathError(XPathErrorCode.RESERVED_NAMESPACE, 'No name can be in the xmlns namespace', name, context.text);
  return resolved;
}

/** Resolves a name, an unprefixed one taking `unprefixedNamespace`. */
function resolve(name: UnresolvedName, context: NamespaceContext, unprefixedNamespace: string): ResolvedName {
  const { localName, prefix } = name;
  if (name.namespaceURI !== undefined)
    return outsideXmlns({ namespaceURI: name.namespaceURI, localName, prefix: '' }, name, context);
  const namespaceURI = prefix === '' ? unprefixedNamespace : namespaceOf(prefix, name, context);
  return outsideXmlns({ namespaceURI, localName, prefix }, name, context);
}

/** Resolves an element or type name: unprefixed, it takes the default element namespace. */
export function resolveElementName(name: UnresolvedName, context: NamespaceContext): ResolvedName {
  return resolve(name, context, context.defaultElementNamespace);
}

/** Resolves an attribute or variable name: unprefixed, it is in no namespace. */
export function resolvePlainName(name: UnresolvedName, context: NamespaceContext): ResolvedName {
  return resolve(name, context, '');
}

/** Resolves a function name: unprefixed, it is in the standard function namespace. */
export function resolveFunctionName(name: UnresolvedName, context: NamespaceContext): ResolvedName {
  return resolve(name, context, FN_NAMESPACE);
}
