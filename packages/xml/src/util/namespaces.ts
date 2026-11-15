/** The namespace the `xml` prefix is bound to. */
export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/** The namespace of `xmlns` attributes. */
export const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

/** How the name of an attribute that declares a prefix starts, as in `xmlns:p="…"`. */
export const XMLNS_COLON = 'xmlns:';

/** The attribute name that declares a prefix: `xmlns` for the default namespace, else `xmlns:prefix`. */
export function declarationName(prefix: string): string {
  return prefix === '' ? 'xmlns' : `${XMLNS_COLON}${prefix}`;
}

/** The prefix an attribute with a qualified name declares, `''` for the default namespace; undefined for any other attribute. */
export function declaredPrefixOf(qName: string): string | undefined {
  if (qName === 'xmlns') return '';
  return qName.startsWith(XMLNS_COLON) ? qName.slice(XMLNS_COLON.length) : undefined;
}

/**
 * The message for the namespace rule (Namespaces §3) that binding `prefix` to `uri` breaks, or
 * undefined when it breaks none. The `xml` prefix and its namespace belong only to each other, and
 * `xmlns` and its namespace can't be bound at all.
 */
export function reservedBindingProblem(prefix: string, uri: string | undefined): string | undefined {
  if (prefix === 'xmlns' || uri === XMLNS_NAMESPACE) {
    return 'The xmlns prefix and namespace only declare other prefixes';
  }
  if (prefix === 'xml' && uri !== XML_NAMESPACE) return `The xml prefix cannot be bound to ${uri}`;
  if (prefix !== 'xml' && uri === XML_NAMESPACE) return `${XML_NAMESPACE} needs the xml prefix`;
  return undefined;
}

/** A start tag's namespace declarations, as a reader reports them: `xmlns="…"` and `xmlns:p="…"`. */
interface NamespaceDeclarations {
  namespaceCount(): number;

  namespacePrefix(index: number): string;

  namespaceURI(index: number): string;
}

/**
 * The namespaces in scope inside an element, by prefix: those in scope at its parent, with the
 * element's own declarations added. Returns `parent` itself when the element declares none.
 */
export function namespacesInScope(
  parent: ReadonlyMap<string, string>,
  tag: NamespaceDeclarations
): ReadonlyMap<string, string> {
  const count = tag.namespaceCount();
  if (count === 0) return parent;
  const scope = new Map(parent);
  for (let i = 0; i < count; i++) scope.set(tag.namespacePrefix(i), tag.namespaceURI(i));
  return scope;
}

/** The prefixes a start tag declares, `''` for the default namespace. */
export function declaredPrefixes(tag: NamespaceDeclarations): string[] {
  const prefixes: string[] = [];
  for (let i = 0; i < tag.namespaceCount(); i++) prefixes.push(tag.namespacePrefix(i));
  return prefixes;
}
