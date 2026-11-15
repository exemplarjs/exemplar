import { type NamespaceBinding, NodeKind, type XdmNode } from '@exemplarjs/xdm';
import { expandedKey, FN_NAMESPACE } from '@/static/static-context';

/** A node's position among its siblings that pass a test, counted from 1. */
function positionAmong(node: XdmNode, sameKind: (sibling: XdmNode) => boolean): number {
  let position = 1;
  for (const sibling of node.axis('preceding-sibling')) if (sameKind(sibling)) position++;
  return position;
}

/** One step of a node's path from its parent. */
function step(node: XdmNode): string {
  switch (node.kind) {
    case NodeKind.ELEMENT: {
      const position = positionAmong(
        node,
        (sibling) => sibling.kind === NodeKind.ELEMENT && expandedKey(sibling) === expandedKey(node)
      );
      return `${expandedKey(node)}[${position}]`;
    }
    case NodeKind.ATTRIBUTE: {
      return node.namespaceURI === '' ? `@${node.localName}` : `@${expandedKey(node)}`;
    }
    case NodeKind.TEXT: {
      return `text()[${positionAmong(node, (sibling) => sibling.kind === NodeKind.TEXT)}]`;
    }
    case NodeKind.COMMENT: {
      return `comment()[${positionAmong(node, (sibling) => sibling.kind === NodeKind.COMMENT)}]`;
    }
    case NodeKind.PROCESSING_INSTRUCTION: {
      const sameTarget = (sibling: XdmNode): boolean =>
        sibling.kind === NodeKind.PROCESSING_INSTRUCTION && sibling.localName === node.localName;
      return `processing-instruction(${node.localName})[${positionAmong(node, sameTarget)}]`;
    }
    default: {
      const prefix = (node.binding as NamespaceBinding).prefix;
      return prefix === '' ? `namespace::*[Q{${FN_NAMESPACE}}local-name()=""]` : `namespace::${prefix}`;
    }
  }
}

/**
 * `fn:path`: a path that selects the node from its root, as F&O §14.6.4 writes it; a tree whose root
 * is not a document starts with `Q{...}root()`.
 */
export function pathOf(node: XdmNode): string {
  const steps: string[] = [];
  let current: XdmNode = node;
  for (let parent = current.parent; parent !== null; parent = current.parent) {
    steps.push(step(current));
    current = parent;
  }
  const isDocument = current.kind === NodeKind.DOCUMENT;
  const root = isDocument ? '' : `Q{${FN_NAMESPACE}}root()`;
  if (steps.length === 0) return isDocument ? '/' : root;
  return `${root}/${steps.toReversed().join('/')}`;
}
