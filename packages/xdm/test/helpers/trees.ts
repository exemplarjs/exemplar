import { type InputOptions, type Source, XMLInputFactory } from '@exemplarjs/xml';
import { byCodeUnit } from '@exemplarjs/xml/internal';
import { NodeKind, XdmDocumentBuilder, type XdmNode } from '@/index';

/** Parses a document with a builder over a factory with the given options; returns its document node. */
export function parse(source: Source, options: InputOptions = {}): XdmNode {
  return new XdmDocumentBuilder(new XMLInputFactory(options)).parse(source);
}

/** A node's element children. */
function elements(node: XdmNode): XdmNode[] {
  return node.children().filter((child) => child.kind === NodeKind.ELEMENT);
}

/** The element reached from a node by taking, at each step, the element child at that position. */
export function at(node: XdmNode, ...path: number[]): XdmNode {
  let current = node;
  for (const index of path) current = elements(current)[index] as XdmNode;
  return current;
}

/** A node as a short string: its kind, name and string value, for comparing lists of nodes. */
export function label(node: XdmNode): string {
  const name = node.nodeName?.toString();
  return name === undefined ? `${node.kindName}(${node.stringValue})` : `${node.kindName} ${name}`;
}

/** Labels for a sequence of nodes. */
export function labels(nodes: Iterable<XdmNode>): string[] {
  return [...nodes].map((node) => label(node));
}

/** A node and everything below it as lines: kind, expanded name and value, and an element's namespaces and attributes, sorted. */
export function dump(node: XdmNode, depth = 0): string[] {
  const indent = ' '.repeat(depth);
  const name = node.nodeName === null ? '' : `{${node.namespaceURI}}${node.localName}`;
  if (node.kind !== NodeKind.ELEMENT) return [`${indent}${node.kindName} ${name} ${JSON.stringify(node.stringValue)}`];
  const namespaces = node.namespaceNodes().map((namespace) => `${namespace.localName}=${namespace.stringValue}`);
  const attributes = node
    .attributes()
    .map((attribute) => `{${attribute.namespaceURI}}${attribute.localName}=${attribute.stringValue}`);
  const lines = [
    `${indent}element ${name} [${namespaces.toSorted(byCodeUnit).join(' ')}] [${attributes.toSorted(byCodeUnit).join(' ')}]`,
  ];
  for (const child of node.children()) lines.push(...dump(child, depth + 1));
  return lines;
}
