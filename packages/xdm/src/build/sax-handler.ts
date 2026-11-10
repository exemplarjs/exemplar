import { IllegalStateError, InvalidArgumentError } from '@exemplarjs/xml';
import type { Location } from '@exemplarjs/xml';
import {
  checkQName,
  copyString,
  declaredPrefixOf,
  ErrorFactory,
  isAllWhitespace,
  locationOf,
  prefixOf,
  type SAXAttributes,
  type SAXLocator,
  StructureCheck,
} from '@exemplarjs/xml/internal';
import { XdmNode } from '@/node/xdm-node';
import { ROOT_NODE } from '@/tree/tree';
import type { TreeBuilder } from '@/tree/tree-builder';
import { flagsOf } from './cursor-loader.ts';
import { OpenEntities } from './open-entities.ts';

/**
 * A SAX handler that builds an XDM tree from the events it is given, as
 * `XdmDocumentBuilder.createSAXHandler()` makes one. It ends a chain of SAX filters, so that what
 * they change is what the tree holds:
 *
 * ```ts
 * const handler = builder.createSAXHandler();
 * new SAXParser().parse(source, new RenamingFilter(handler));
 * handler.document.stringValue;
 * ```
 *
 * The events must be namespace-aware, as XDM's names are. They are checked as they come, as a
 * filter can get them wrong: elements balance with matching end tags, there is one root and no text
 * outside it, and names are well formed and agree with their parts. A prefix an element or
 * attribute uses without a mapping in scope is declared on it. Each `startDocument` starts a new
 * tree, so one handler can build one document after another.
 */
export class XdmBuildingHandler {
  readonly #newTree: () => TreeBuilder;
  #tree: TreeBuilder | undefined;
  /** Where the events are, for the errors the checks throw. */
  readonly #where = (): Location => locationOf(this.#locator);
  #structure = new StructureCheck(this.#where);
  #locator: SAXLocator | undefined;
  #document: XdmNode | undefined;
  /** The prefix mappings for the next start tag. */
  readonly #pendingPrefixes: string[] = [];
  readonly #pendingURIs: string[] = [];
  /** The bindings in scope, innermost last: the depth of the element that made each, its prefix and its URI. */
  readonly #bindingDepths: number[] = [];
  readonly #bindingPrefixes: string[] = [];
  readonly #bindingURIs: string[] = [];
  /** Whether the events are inside the DTD, whose comments and processing instructions the tree leaves out. */
  #inDTD = false;
  /** The names of the external parsed entities the DTD declares. */
  readonly #externalEntities = new Set<string>();
  readonly #entities = new OpenEntities();

  /** A handler whose trees come from `newTree`, which the builder gives. @internal */
  constructor(newTree: () => TreeBuilder) {
    this.#newTree = newTree;
  }

  /** The document node of the tree built, once `endDocument` has been called. */
  get document(): XdmNode {
    if (this.#document === undefined) throw ErrorFactory.create(IllegalStateError, 'The document is not finished yet');
    return this.#document;
  }

  setDocumentLocator(locator: SAXLocator): void {
    this.#locator = locator;
  }

  startDocument(): void {
    const tree = this.#newTree();
    tree.startDocument(this.#locator?.systemId ?? null);
    this.#tree = tree;
    this.#document = undefined;
    this.#structure = new StructureCheck(this.#where);
    this.#pendingPrefixes.length = 0;
    this.#pendingURIs.length = 0;
    this.#unbind(0);
    this.#inDTD = false;
    this.#externalEntities.clear();
    this.#entities.clear();
  }

  endDocument(): void {
    this.#structure.endDocument();
    const tree = this.#started();
    tree.endDocument();
    this.#document = XdmNode.of(tree.finish(), ROOT_NODE);
  }

  startPrefixMapping(prefix: string, uri: string): void {
    this.#pendingPrefixes.push(prefix);
    this.#pendingURIs.push(uri);
  }

  startElement(uri: string, localName: string, qName: string, attributes: SAXAttributes): void {
    const tree = this.#started();
    if (localName === '' && qName !== '') {
      throw ErrorFactory.create(InvalidArgumentError, 'XdmBuildingHandler needs namespace-aware events');
    }
    this.#structure.startElement(qName);
    const prefix = prefixOf(qName);
    checkQName('element', qName, localName, prefix, uri, this.#where);
    const names = tree.names;
    const parent = tree.current;
    const element = tree.startElement(names.code(qName, names.namespace(uri)));
    this.#declarePending(tree);
    this.#declareIfUnbound(tree, prefix, uri);
    for (let i = 0; i < attributes.length; i++) {
      const name = attributes.qName(i);
      // Declarations reported as attributes are in the mappings already.
      if (declaredPrefixOf(name) !== undefined) continue;
      const attributeURI = attributes.uri(i);
      const attributePrefix = prefixOf(name);
      checkQName('attribute', name, attributes.localName(i), attributePrefix, attributeURI, this.#where);
      if (attributePrefix !== '') this.#declareIfUnbound(tree, attributePrefix, attributeURI);
      const value = copyString(attributes.value(i));
      tree.attribute(names.code(name, names.namespace(attributeURI)), value, flagsOf(attributes.type(i)));
    }
    if (this.#entities.length > 0) this.#entityBase(tree, element, parent);
  }

  endElement(_uri: string, _localName: string, qName: string): void {
    const depth = this.#structure.depth;
    this.#structure.endElement(qName);
    this.#started().endElement();
    const depths = this.#bindingDepths;
    let count = depths.length;
    while (count > 0 && depths[count - 1] === depth) count--;
    if (count < depths.length) this.#unbind(count);
  }

  characters(text: string): void {
    if (this.#structure.depth === 0) this.#structure.outsideRoot(isAllWhitespace(text));
    else this.#started().text(text);
  }

  ignorableWhitespace(text: string): void {
    this.characters(text);
  }

  comment(text: string): void {
    if (!this.#inDTD) this.#started().comment(copyString(text));
  }

  processingInstruction(target: string, data: string): void {
    if (this.#inDTD) return;
    const tree = this.#started();
    const parent = tree.current;
    const instruction = tree.processingInstruction(tree.names.code(target, ''), copyString(data));
    if (this.#entities.length > 0) this.#entityBase(tree, instruction, parent);
  }

  startDTD(): void {
    this.#inDTD = true;
  }

  endDTD(): void {
    this.#inDTD = false;
  }

  externalEntityDecl(name: string): void {
    this.#externalEntities.add(name);
  }

  unparsedEntityDecl(name: string, publicId: string | undefined, systemId: string): void {
    this.#started().addUnparsedEntity(name, { systemId, publicId: publicId ?? '' });
  }

  startEntity(name: string): void {
    if (!this.#inDTD) this.#entities.start(this.#started().current, this.#externalEntities.has(name));
  }

  endEntity(): void {
    if (!this.#inDTD) this.#entities.end();
  }

  /** The tree being built; events before `startDocument` are refused. */
  #started(): TreeBuilder {
    if (this.#tree === undefined) throw ErrorFactory.create(IllegalStateError, 'startDocument must come first');
    return this.#tree;
  }

  /** Declares the pending prefix mappings on the element just started. */
  #declarePending(tree: TreeBuilder): void {
    const prefixes = this.#pendingPrefixes;
    if (prefixes.length === 0) return;
    for (let i = 0; i < prefixes.length; i++)
      this.#declare(tree, prefixes[i] as string, this.#pendingURIs[i] as string);
    prefixes.length = 0;
    this.#pendingURIs.length = 0;
  }

  /** Declares a prefix on the element just started, unless it is bound to the URI already. */
  #declareIfUnbound(tree: TreeBuilder, prefix: string, uri: string): void {
    if (prefix !== 'xml' && this.#boundURI(prefix) !== uri) this.#declare(tree, prefix, uri);
  }

  /** Declares a prefix on the element just started, and brings it into scope. */
  #declare(tree: TreeBuilder, prefix: string, uri: string): void {
    tree.namespace(prefix, tree.names.namespace(uri));
    this.#bindingDepths.push(this.#structure.depth);
    this.#bindingPrefixes.push(prefix);
    this.#bindingURIs.push(uri);
  }

  /** Keeps the first `count` bindings, as the elements that made the others have ended. */
  #unbind(count: number): void {
    this.#bindingDepths.length = count;
    this.#bindingPrefixes.length = count;
    this.#bindingURIs.length = count;
  }

  /** The URI a prefix is bound to in scope; `''` when it is not bound. */
  #boundURI(prefix: string): string {
    const prefixes = this.#bindingPrefixes;
    for (let i = prefixes.length - 1; i >= 0; i--) if (prefixes[i] === prefix) return this.#bindingURIs[i] as string;
    return '';
  }

  /** Gives a node at the top of an external entity, directly or through internal ones, the entity's URI. */
  #entityBase(tree: TreeBuilder, node: number, parent: number): void {
    const systemId = this.#locator?.systemId;
    if (systemId !== undefined && this.#entities.atTopOfExternal(parent)) tree.setBaseURI(node, systemId);
  }
}
