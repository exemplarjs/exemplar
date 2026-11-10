import { XML_NAMESPACE } from '@exemplarjs/xml/internal';
import { NodeKind } from '@/node-kind';
import { NO_NODE, type Tree } from './tree.ts';

/** A prefix and the namespace URI it is bound to, as a namespace node holds them. */
export interface NamespaceBinding {
  /** The prefix, `''` for the default namespace. */
  readonly prefix: string;
  readonly uri: string;
}

/** The binding every element has. */
const XML_BINDING: NamespaceBinding = { prefix: 'xml', uri: XML_NAMESPACE };

/**
 * The namespaces in scope for an element, one per namespace node it has: `xml` first, then the
 * innermost binding of each other prefix, the element's own declarations before its ancestors'.
 */
export function inScopeNamespaces(tree: Tree, element: number): NamespaceBinding[] {
  const bindings = [XML_BINDING];
  const seen = new Set<string>(['xml']);
  const owners = tree.namespaceOwners;
  for (let node = element; node !== NO_NODE && tree.kind(node) === NodeKind.ELEMENT; node = tree.parent(node)) {
    for (let declaration = tree.firstDeclaration(node); owners[declaration] === node; declaration++) {
      const prefix = tree.namespacePrefixes[declaration] as string;
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      const uri = tree.namespaceURIs[declaration] as string;
      // An empty URI undeclares the prefix, hiding the ancestors' bindings of it.
      if (uri !== '') bindings.push({ prefix, uri });
    }
  }
  return bindings;
}

/** The URI a prefix is bound to at an element, `''` for no default namespace, or undefined for an unbound prefix. */
export function namespaceForPrefix(tree: Tree, element: number, prefix: string): string | undefined {
  const uri = inScopeNamespaces(tree, element).find((binding) => binding.prefix === prefix)?.uri;
  return uri ?? (prefix === '' ? '' : undefined);
}
