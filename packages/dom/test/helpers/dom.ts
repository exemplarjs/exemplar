import { expect } from 'vitest';
import { type InputOptions, type Source, XMLInputFactory } from '@exemplarjs/xml';
import { type BuilderOptions, type Document, DocumentBuilder, type Node, XMLSerializer } from '@/index';

/** The legacy DOMException codes of the exceptions the DOM raises. */
const CODES = {
  IndexSizeError: 1,
  HierarchyRequestError: 3,
  WrongDocumentError: 4,
  InvalidCharacterError: 5,
  NoModificationAllowedError: 7,
  NotFoundError: 8,
  NotSupportedError: 9,
  InUseAttributeError: 10,
  NamespaceError: 14,
  TypeMismatchError: 17,
} as const;

/** A DOMException name the DOM raises. */
export type DOMExceptionName = keyof typeof CODES;

/** Matches a DOMException by its name and legacy code. */
export function domException(name: DOMExceptionName): unknown {
  return expect.objectContaining({ name, code: CODES[name] });
}

/** Builds a tree with a factory's options and the builder's own. */
export function build(source: Source, options: InputOptions = {}, builder: BuilderOptions = {}): Document {
  return new DocumentBuilder(new XMLInputFactory(options), builder).parse(source);
}

/** Builds a tree asynchronously, as from a stream. */
export function buildAsync(
  source: Source,
  options: InputOptions = {},
  builder: BuilderOptions = {}
): Promise<Document> {
  return new DocumentBuilder(new XMLInputFactory(options), builder).parseAsync(source);
}

/** An empty document. */
export function newDocument(): Document {
  return new DocumentBuilder().newDocument();
}

/** A node serialized as browsers' XMLSerializer does. */
export function serialize(node: Node): string {
  return new XMLSerializer().serializeToString(node);
}

/** The children of a node as `type:name:text`. */
export function children(node: Node): string[] {
  return [...node.childNodes].map((n) => `${n.nodeType}:${n.nodeName}:${n.textContent}`);
}
