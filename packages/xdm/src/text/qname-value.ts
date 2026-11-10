import { QName } from '@exemplarjs/xml';
import { lexicalQNameParts } from '@exemplarjs/xml/internal';
import { XPathErrorCode, xdmError } from '@/errors';

/** Gives the namespace URI a prefix is bound to, `''` for the default namespace when none is declared, or undefined. */
export type PrefixResolver = (prefix: string) => string | undefined;

/**
 * The QName a lexical form such as `x:item` names, its prefix resolved; undefined when the text
 * is not a QName. An unprefixed name takes the default namespace; an unbound prefix raises FONS0004.
 */
export function parseQName(text: string, resolve: PrefixResolver): QName | undefined {
  const parts = lexicalQNameParts(text);
  if (parts === undefined) return undefined;
  const [prefix, localName] = parts;
  const uri = resolve(prefix);
  if (uri === undefined)
    return xdmError(XPathErrorCode.UNBOUND_QNAME_PREFIX, `No namespace is bound to the prefix ${prefix}`);
  return new QName(uri, localName, prefix);
}

/** Whether two QNames are equal, as `eq` compares them: by namespace URI and local name, whatever the prefixes. */
export function sameQName(a: QName, b: QName): boolean {
  return a.namespaceURI === b.namespaceURI && a.localName === b.localName;
}
