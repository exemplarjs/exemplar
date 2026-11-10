import { resolveEscapedTargetURI, XML_NAMESPACE } from '@exemplarjs/xml/internal';
import { NO_NAME } from '@/names/name-table';
import { NodeKind } from '@/node-kind';
import { NO_NODE, type Tree } from './tree.ts';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { DOCUMENT, ELEMENT, PROCESSING_INSTRUCTION } = NodeKind;

/**
 * `dm:base-uri` by XML Base: the document's or external entity's URI, with each `xml:base` below it
 * resolved in turn; text, comments and other instructions take their parent's. Null if none.
 */
export function baseURI(tree: Tree, node: number): string | null {
  const kind = tree.kind(node);
  // A processing instruction at the top of an external entity has that entity's URI.
  if (kind === PROCESSING_INSTRUCTION) {
    const own = tree.baseURIs.get(node);
    if (own !== undefined) return own;
  }
  const isContainer = kind === ELEMENT || kind === DOCUMENT;
  const element = isContainer ? node : tree.parent(node);
  const xmlBase = tree.names.lookup(XML_NAMESPACE, 'base');
  // The xml:base values from the element up, resolved afterwards from the top down.
  const pending: string[] = [];
  let base: string | null = null;
  for (let current = element; current !== NO_NODE; current = tree.parent(current)) {
    if (tree.kind(current) === DOCUMENT) {
      base = tree.baseURIs.get(current) ?? tree.documentURI;
      break;
    }
    const attribute = xmlBase === NO_NAME ? NO_NODE : tree.findAttribute(current, xmlBase);
    if (attribute !== NO_NODE) pending.push(tree.attributeValue(attribute));
    const entityBase = tree.baseURIs.get(current);
    if (entityBase !== undefined) {
      base = entityBase;
      break;
    }
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    const reference = pending[i] as string;
    base = resolveEscapedTargetURI(reference, base ?? undefined);
  }
  return base;
}
