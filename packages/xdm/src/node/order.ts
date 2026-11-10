import { NodeKind } from '@/node-kind';
import { inScopeNamespaces } from '@/tree/namespaces';
import type { XdmNode } from './xdm-node.ts';

/** Where a node sorts among its element's own nodes: the element, then its namespaces, then its attributes. */
const Place = { NODE: 0, NAMESPACE: 1, ATTRIBUTE: 2 } as const;

/** Where a namespace node comes among its element's namespace nodes. */
export function namespacePosition(node: XdmNode): number {
  const prefix = node.binding?.prefix;
  return inScopeNamespaces(node.tree, node.index).findIndex((binding) => binding.prefix === prefix);
}

/**
 * Negative, zero or positive as `a` comes before, is, or comes after `b` in document order. Nodes
 * of different trees sort by the order their trees were made in, which is stable, as XDM asks.
 */
export function compareOrder(a: XdmNode, b: XdmNode): number {
  if (a.tree !== b.tree) return a.tree.number - b.tree.number;
  const owner = ownerOf(a) - ownerOf(b);
  if (owner !== 0) return owner;
  const place = placeOf(a) - placeOf(b);
  if (place !== 0) return place;
  if (a.kind === NodeKind.NAMESPACE) return namespacePosition(a) - namespacePosition(b);
  return a.index - b.index;
}

/** The tree node a node belongs to and sorts by: itself, or an attribute's or namespace node's element. */
export function ownerOf(node: XdmNode): number {
  return node.kind === NodeKind.ATTRIBUTE ? node.tree.attributeOwner(node.index) : node.index;
}

/** Where a node sorts among its element's own nodes. */
function placeOf(node: XdmNode): number {
  if (node.kind === NodeKind.ATTRIBUTE) return Place.ATTRIBUTE;
  return node.kind === NodeKind.NAMESPACE ? Place.NAMESPACE : Place.NODE;
}
