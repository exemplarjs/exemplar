import {
  ANY_NAME,
  compareOrder,
  EMPTY_SEQUENCE,
  isNode,
  NodeKind,
  XdmAtomicValue,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { namespacePosition } from '@exemplarjs/xdm/internal';
import { splitWhitespace, XML_NAMESPACE } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { FunctionDefinition, FunctionImplementation } from '@/functions/function-library';
import { defineFunction, defineWithLast } from '@/functions/signatures';
import { atomize } from '@/runtime/atomization';
import { inDocumentOrder } from '@/runtime/document-order';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { pathOf } from './node-paths.ts';
import { anyURIResult, booleanResult, onlyItem, stringArgument, stringResult } from './values.ts';

/** The context item as a node; XPDY0002 when there is none, XPTY0004 when it is not a node. */
function contextNode(context: DynamicContext): XdmNode {
  const item = context.contextItem();
  if (!isNode(item)) return dynamicError(XPathErrorCode.TYPE_MISMATCH, 'The context item is not a node');
  return item;
}

/** The node an argument of type `node()` gives, or the context node when the argument is left out. */
function nodeOrContext(value: XdmValue | undefined, context: DynamicContext): XdmNode {
  return value === undefined ? contextNode(context) : onlyItem<XdmNode>(value);
}

/** A function of an optional node, giving `whenEmpty` for none, with a form without arguments that takes the context node. */
function nodeFunction(
  name: string,
  returnType: string,
  operation: (node: XdmNode) => XdmValue,
  whenEmpty: XdmValue = EMPTY_SEQUENCE
): FunctionDefinition[] {
  const implementation: FunctionImplementation = ([arg]) => {
    const node = arg?.[0] as XdmNode | undefined;
    return node === undefined ? whenEmpty : operation(node);
  };
  return [
    defineFunction(`fn:${name}() as ${returnType}`, (_, context) => operation(contextNode(context))),
    defineFunction(`fn:${name}($arg as node()?) as ${returnType}`, implementation),
  ];
}

/** A function of an optional node that gives a string, `''` for no node. */
function nodeStringFunction(name: string, operation: (node: XdmNode) => string): FunctionDefinition[] {
  return nodeFunction(name, 'xs:string', (node) => stringResult(operation(node)), stringResult(''));
}

/** A URI as a value, or empty for null. */
function optionalURI(uri: string | null): XdmValue {
  return uri === null ? EMPTY_SEQUENCE : anyURIResult(uri);
}

/** Whether a node's language, from the nearest `xml:lang`, is a language or a sublanguage of it. */
function hasLanguage(node: XdmNode, language: string): boolean {
  for (let current: XdmNode | null = node; current !== null; current = current.parent) {
    const lang = current.attribute('lang', XML_NAMESPACE);
    if (lang === undefined) continue;
    const wanted = language.toLowerCase();
    const actual = lang.toLowerCase();
    return actual === wanted || actual.startsWith(`${wanted}-`);
  }
  return false;
}

/** A node's identifier, unique among the nodes of every tree: its tree's number, its kind, its number, and a namespace node's place. */
function generateId(node: XdmNode): string {
  const place = node.kind === NodeKind.NAMESPACE ? `n${namespacePosition(node)}` : '';
  return `t${node.tree.number}k${node.kind}i${node.index}${place}`;
}

/** The IDs or IDREFs a string list names: each string split at whitespace. */
function tokensOf(value: XdmValue): string[] {
  return value.flatMap((item) => splitWhitespace(String((item as XdmAtomicValue).value)));
}

/** The document of the node a lookup by ID starts from; FODC0001 when its tree has none. */
function documentOf(node: XdmNode): XdmNode {
  const root = node.root;
  if (root.kind !== NodeKind.DOCUMENT)
    return dynamicError(XPathErrorCode.NOT_IN_A_DOCUMENT, 'The node is not in a document');
  return root;
}

/** `fn:id` and `fn:element-with-id`: the elements with the IDs, in document order. */
function elementsWithIds(ids: XdmValue, node: XdmNode): XdmValue {
  const document = documentOf(node);
  const found = tokensOf(ids)
    .map((id) => document.elementById(id))
    .filter((element): element is XdmNode => element !== null);
  return inDocumentOrder(found);
}

/** `fn:idref`: the attributes, of IDREF or IDREFS type, that refer to the IDs. */
function referencesTo(ids: XdmValue, node: XdmNode): XdmValue {
  const wanted = new Set(tokensOf(ids));
  const found: XdmNode[] = [];
  for (const element of documentOf(node).axis('descendant', { kind: NodeKind.ELEMENT, name: ANY_NAME })) {
    for (const attribute of element.attributes()) {
      if (attribute.isIdrefs && splitWhitespace(attribute.stringValue).some((token) => wanted.has(token)))
        found.push(attribute);
    }
  }
  return found;
}

/** A function looking nodes up by ID, with a form taking the context node. */
function idFunction(
  name: string,
  returnType: string,
  lookup: (ids: XdmValue, node: XdmNode) => XdmValue
): FunctionDefinition[] {
  return defineWithLast(
    `fn:${name}($arg as xs:string*) as ${returnType}`,
    '$node as node()',
    ([ids = []], node, context) => lookup(ids, nodeOrContext(node, context))
  );
}

/** Nodes with none of the others among their descendants, for `innermost`, or ancestors, for `outermost`. */
function innermostOrOutermost(value: XdmValue, innermost: boolean): XdmValue {
  const nodes = inDocumentOrder(value as readonly XdmNode[]);
  // A subtree is contiguous in document order: a node's descendants in the list follow it at once.
  if (innermost)
    return nodes.filter((node, index) => index === nodes.length - 1 || !isAncestor(node, nodes[index + 1] as XdmNode));
  const kept: XdmNode[] = [];
  for (const node of nodes) {
    const last = kept.at(-1);
    if (last === undefined || !isAncestor(last, node)) kept.push(node);
  }
  return kept;
}

/** Whether a node is a proper ancestor of another. */
function isAncestor(ancestor: XdmNode, node: XdmNode): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (compareOrder(current, ancestor) === 0) return true;
  }
  return false;
}

/** The functions on nodes and their accessors (F&O §2 and §13). */
export const NODE_FUNCTIONS: readonly FunctionDefinition[] = [
  ...nodeFunction('node-name', 'xs:QName?', (node) => {
    const name = node.nodeName;
    return name === null ? EMPTY_SEQUENCE : [new XdmAtomicValue(XS.QName, name)];
  }),
  ...nodeFunction('nilled', 'xs:boolean?', (node) =>
    node.nilled === null ? EMPTY_SEQUENCE : booleanResult(node.nilled)
  ),
  ...nodeFunction('base-uri', 'xs:anyURI?', (node) => optionalURI(node.baseURI)),
  ...nodeFunction('document-uri', 'xs:anyURI?', (node) => optionalURI(node.documentURI)),
  ...nodeFunction('root', 'node()?', (node) => [node.root]),
  ...nodeFunction(
    'has-children',
    'xs:boolean',
    (node) => booleanResult(node.children().length > 0),
    booleanResult(false)
  ),
  ...nodeFunction('path', 'xs:string?', (node) => stringResult(pathOf(node))),
  ...nodeStringFunction('name', (node) => node.nodeName?.toString() ?? ''),
  ...nodeStringFunction('local-name', (node) => node.localName),
  ...nodeFunction('namespace-uri', 'xs:anyURI', (node) => anyURIResult(node.namespaceURI), anyURIResult('')),
  defineFunction('fn:data() as xs:anyAtomicType*', (_, context) => atomize([context.contextItem()])),
  defineFunction('fn:data($arg as item()*) as xs:anyAtomicType*', ([arg = []]) => atomize(arg)),
  ...defineWithLast('fn:lang($testlang as xs:string?) as xs:boolean', '$node as node()', ([language], node, context) =>
    booleanResult(hasLanguage(nodeOrContext(node, context), stringArgument(language)))
  ),
  defineFunction('fn:innermost($nodes as node()*) as node()*', ([nodes = []]) => innermostOrOutermost(nodes, true)),
  defineFunction('fn:outermost($nodes as node()*) as node()*', ([nodes = []]) => innermostOrOutermost(nodes, false)),
  ...nodeStringFunction('generate-id', generateId),
  ...idFunction('id', 'element()*', elementsWithIds),
  ...idFunction('element-with-id', 'element()*', elementsWithIds),
  ...idFunction('idref', 'node()*', referencesTo),
];
