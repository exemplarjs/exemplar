import { compareOrder, type XdmNode } from '@exemplarjs/xdm';

/** Whether nodes are already in document order, with no node twice. */
function inOrder(nodes: readonly XdmNode[]): boolean {
  for (let index = 1; index < nodes.length; index++) {
    if (compareOrder(nodes[index - 1] as XdmNode, nodes[index] as XdmNode) >= 0) return false;
  }
  return true;
}

/** Nodes sorted into document order with duplicates removed, as path steps and set operations give them. */
export function inDocumentOrder(nodes: readonly XdmNode[]): readonly XdmNode[] {
  if (inOrder(nodes)) return nodes;
  const sorted = nodes.toSorted((a, b) => compareOrder(a, b));
  const distinct: XdmNode[] = [];
  for (const node of sorted) {
    const last = distinct.at(-1);
    if (last === undefined || compareOrder(last, node) !== 0) distinct.push(node);
  }
  return distinct;
}
