/** The seven kinds of XDM node, numbered as DOM's `nodeType` numbers them, with 13 for namespaces, which DOM does not number. */
export const NodeKind = {
  ELEMENT: 1,
  ATTRIBUTE: 2,
  TEXT: 3,
  PROCESSING_INSTRUCTION: 7,
  COMMENT: 8,
  DOCUMENT: 9,
  NAMESPACE: 13,
} as const;

export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

/** What `dm:node-kind` returns for each kind. */
const KIND_NAMES: Readonly<Record<NodeKind, string>> = {
  [NodeKind.ELEMENT]: 'element',
  [NodeKind.ATTRIBUTE]: 'attribute',
  [NodeKind.TEXT]: 'text',
  [NodeKind.PROCESSING_INSTRUCTION]: 'processing-instruction',
  [NodeKind.COMMENT]: 'comment',
  [NodeKind.DOCUMENT]: 'document',
  [NodeKind.NAMESPACE]: 'namespace',
};

/** The name `dm:node-kind` gives a kind, such as `processing-instruction`. */
export function kindName(kind: NodeKind): string {
  return KIND_NAMES[kind];
}
