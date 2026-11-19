import { ErrorCode, XMLError } from '@exemplarjs/xml';
import {
  attributesOf,
  ErrorFactory,
  hasScheme,
  localPartOf,
  type NodeLike,
  NodeType,
  NOWHERE,
  prefixDeclaredBy,
  prefixOf,
  XML_NAMESPACE,
} from '@exemplarjs/xml/internal';
import type { CanonicalizeOptions } from './canonicalize.ts';
import type { AncestorAttribute } from './inheritance.ts';
import { type CanonicalAttribute, Canonicalizer, type CanonicalXMLMethod } from './render.ts';

// Module-level constants, so V8 can inline them; imported bindings are read again on every use.
const {
  ELEMENT_NODE,
  TEXT_NODE,
  CDATA_SECTION_NODE,
  ENTITY_REFERENCE_NODE,
  PROCESSING_INSTRUCTION_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} = NodeType;

/** The parts of a DOM node canonicalization reads, so that any DOM Level 2 tree can be canonicalized. */
export interface CanonicalNode extends NodeLike<CanonicalNode> {
  readonly ownerDocument: CanonicalNode | null;
  /** A document's XML version and encodings, which decide whether and how it can be canonicalized. */
  readonly xmlVersion?: string;
  readonly inputEncoding?: string | null;
  readonly xmlEncoding?: string | null;
}

/** Whether a value is a DOM node rather than a source. */
export function isNode(value: unknown): value is CanonicalNode {
  return typeof value === 'object' && value !== null && typeof (value as { nodeType?: unknown }).nodeType === 'number';
}

/** Fails canonicalization of a tree, which has no location to report. */
function fail(code: ErrorCode, message: string): never {
  throw ErrorFactory.create(XMLError, code, message, NOWHERE);
}

/**
 * Canonical XML 1.0 and 1.1, and Exclusive Canonicalization, of a DOM node as a document subset: the
 * node and everything below it. The node is the apex, which has no ancestors in the subset, so it
 * declares every namespace in scope and, for the inclusive forms, takes on its ancestors' `xml:`
 * attributes. Canonicalizing `<b>` of `<a xml:lang="en" xmlns:p="urn:p"><b/></a>` with C14N 1.0
 * gives `<b xmlns:p="urn:p" xml:lang="en"></b>`.
 */
export class TreeCanonicalizer extends Canonicalizer {
  constructor(node: CanonicalNode, method: CanonicalXMLMethod, options: CanonicalizeOptions) {
    const document = node.nodeType === DOCUMENT_NODE ? node : node.ownerDocument;
    if (document?.xmlVersion === '1.1') fail(ErrorCode.C14N_VERSION, 'Canonical XML is not defined for XML 1.1');
    // As for a source: the encoding declared, or else the one detected.
    super(method, options, document?.xmlEncoding ?? document?.inputEncoding);
  }

  /** The canonical form of a document, or of a node and everything below it. */
  write(node: CanonicalNode): string {
    const { nodeType } = node;
    if (nodeType === DOCUMENT_NODE) this.#writeDocument(node);
    else if (nodeType === ELEMENT_NODE) this.#writeApex(node);
    else this.#writeChild(node, noNamespaces(), noNamespaces());
    return this.output;
  }

  /** A whole document: the root element, with comments and processing instructions on lines of their own around it. */
  #writeDocument(node: CanonicalNode): void {
    let sawRoot = false;
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (child.nodeType === ELEMENT_NODE) {
        sawRoot = true;
        this.#writeElement(child, noNamespaces(), noNamespaces(), 'apex');
        continue;
      }
      const markup = this.#commentOrPIMarkup(child);
      if (markup !== '') this.output += sawRoot ? `\n${markup}` : `${markup}\n`;
    }
  }

  /** The markup of a comment or processing instruction; anything else outside the root element has no canonical form. */
  #commentOrPIMarkup(node: CanonicalNode): string {
    if (node.nodeType === COMMENT_NODE) return this.keepsComments ? this.commentMarkup(node.nodeValue ?? '') : '';
    return node.nodeType === PROCESSING_INSTRUCTION_NODE ? this.piMarkup(node.nodeName, node.nodeValue ?? '') : '';
  }

  /** Writes a node inside the apex: an element, character data, or the children of a reference or fragment. */
  #writeChild(node: CanonicalNode, scope: ReadonlyMap<string, string>, rendered: ReadonlyMap<string, string>): void {
    switch (node.nodeType) {
      case ELEMENT_NODE: {
        this.#writeElement(node, scope, rendered, 'descendant');
        break;
      }
      case TEXT_NODE:
      case CDATA_SECTION_NODE: {
        this.writeCharacters(node.nodeValue ?? '');
        break;
      }
      case ENTITY_REFERENCE_NODE:
      case DOCUMENT_FRAGMENT_NODE: {
        for (let child = node.firstChild; child !== null; child = child.nextSibling)
          this.#writeChild(child, scope, rendered);
        break;
      }
      default: {
        this.output += this.#commentOrPIMarkup(node);
      }
    }
  }

  /** Writes the apex element, which inherits the namespaces in scope from its ancestors. */
  #writeApex(node: CanonicalNode): void {
    this.#writeElement(node, namespacesInScopeAt(node.parentNode), noNamespaces(), 'apex');
  }

  /** Writes an element, its content and its end tag; `role` says whether it is the apex of the subset. */
  #writeElement(
    node: CanonicalNode,
    parentScope: ReadonlyMap<string, string>,
    parentRendered: ReadonlyMap<string, string>,
    role: 'apex' | 'descendant'
  ): void {
    const isApex = role === 'apex';
    const ownAttributes = attributesOf(node);
    const [scope, declaredHere] = declareNamespaces(ownAttributes, parentScope);
    // The apex's namespace nodes include those it inherits, which must not be relative either.
    if (isApex) for (const uri of scope.values()) requireAbsolute(uri);
    const own = ownAttributes.flatMap((attr) => canonicalAttribute(attr));
    const attributes = this.sortedAttributes(own, isApex ? ancestorXmlAttributes(node) : undefined);
    const candidates = this.candidatePrefixes(isApex, scope, prefixOf(node.nodeName), attributes, () => declaredHere);
    const rendered = this.writeStartTag(node.nodeName, candidates, scope, parentRendered, attributes);
    for (let child = node.firstChild; child !== null; child = child.nextSibling)
      this.#writeChild(child, scope, rendered);
    this.output += `</${node.nodeName}>`;
  }
}

/** An attribute as canonicalization writes it; none for a namespace declaration. */
function canonicalAttribute(attr: CanonicalNode): CanonicalAttribute[] {
  if (prefixDeclaredBy(attr) !== undefined) return [];
  const uri = attr.namespaceURI ?? (prefixOf(attr.nodeName) === 'xml' ? XML_NAMESPACE : '');
  return [[uri, attr.localName ?? localPartOf(attr.nodeName), attr.nodeName, attr.nodeValue ?? '']];
}

/** The `xml:` attributes of a node's ancestors, outermost first. */
function ancestorXmlAttributes(node: CanonicalNode): AncestorAttribute[] {
  const attributes: AncestorAttribute[] = [];
  for (let ancestor = node.parentNode; ancestor?.nodeType === ELEMENT_NODE; ancestor = ancestor.parentNode) {
    const own = attributesOf(ancestor).filter((attr) => prefixOf(attr.nodeName) === 'xml');
    attributes.unshift(...own.map((attr): AncestorAttribute => [attr.nodeName, attr.nodeValue ?? '']));
  }
  return attributes;
}

/** No namespaces bound, or rendered, but the empty default. */
function noNamespaces(): Map<string, string> {
  return new Map([['', '']]);
}

/** The scope an element's declarations make inside its parent's, and the prefixes it declares. */
function declareNamespaces(
  ownAttributes: readonly CanonicalNode[],
  parentScope: ReadonlyMap<string, string>
): [Map<string, string>, Set<string>] {
  const scope = new Map(parentScope);
  const declaredHere = new Set<string>();
  for (const attr of ownAttributes) {
    const prefix = prefixDeclaredBy(attr);
    if (prefix === undefined) continue;
    const uri = requireAbsolute(attr.nodeValue ?? '');
    scope.set(prefix, uri);
    declaredHere.add(prefix);
  }
  return [scope, declaredHere];
}

/** The namespaces in scope at a node, from its ancestors' declarations; the nearest wins. */
function namespacesInScopeAt(node: CanonicalNode | null): Map<string, string> {
  const chain: CanonicalNode[] = [];
  for (let element = node; element !== null && element.nodeType === ELEMENT_NODE; element = element.parentNode)
    chain.unshift(element);
  const scope = new Map([['', '']]);
  for (const element of chain) {
    for (const attr of attributesOf(element)) {
      const prefix = prefixDeclaredBy(attr);
      if (prefix !== undefined) scope.set(prefix, attr.nodeValue ?? '');
    }
  }
  return scope;
}

/** Returns a namespace URI, refusing it when it is relative, as canonicalization must. */
function requireAbsolute(uri: string): string {
  if (uri !== '' && !hasScheme(uri)) fail(ErrorCode.C14N_RELATIVE_NAMESPACE, `The namespace URI ${uri} is relative`);
  return uri;
}
