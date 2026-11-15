import {
  castAs,
  isArray,
  isAtomicValue,
  isMap,
  isNode,
  TreeBuilder,
  XdmDocumentBuilder,
  type XdmItem,
  XdmNode,
  XS,
} from '@exemplarjs/xdm';
import { XMLInputFactory } from '@exemplarjs/xml';
import { XPathCompiler, type XPathCompilerOptions, XPathException } from '@/index';

const builder = new XdmDocumentBuilder(new XMLInputFactory());

/** A document parsed from text, with a URI so that base URIs resolve. */
export function parse(xml: string, systemId = 'http://example.com/doc.xml'): XdmNode {
  return builder.parse({ text: xml, systemId });
}

/** An item as a test reads it: an atomic value as its type and text, a node as its kind and name, a function by its size or arity. */
export function describeItem(item: XdmItem): string {
  if (isAtomicValue(item)) return `${item.type.toString()} ${String(castAs(item, XS.string).value)}`;
  if (isMap(item)) return `map(${item.size})`;
  if (isArray(item)) return `array(${item.size})`;
  if (!isNode(item)) return `function ${item.name?.toString() ?? '(anonymous)'}#${item.arity}`;
  const name = item.nodeName?.toString();
  return name === undefined ? item.kindName : `${item.kindName} ${name}`;
}

/** Evaluates an expression and describes each item of its result. */
export function evaluate(
  expression: string,
  contextItem: XdmItem | null = null,
  options: XPathCompilerOptions = {}
): string[] {
  return new XPathCompiler(options)
    .compile(expression)
    .evaluate(contextItem)
    .map((item) => describeItem(item));
}

/** Evaluates an expression and gives the string value of each item of its result. */
export function strings(
  expression: string,
  contextItem: XdmItem | null = null,
  options: XPathCompilerOptions = {}
): string[] {
  return new XPathCompiler(options).compile(expression).evaluateStrings(contextItem);
}

/** The code of the error compiling or evaluating an expression raises, or undefined when it raises none. */
export function errorCode(
  expression: string,
  contextItem: XdmItem | null = null,
  options: XPathCompilerOptions = {}
): string | undefined {
  try {
    new XPathCompiler(options).compile(expression).evaluate(contextItem);
    return undefined;
  } catch (error) {
    if (error instanceof XPathException) return error.code;
    throw error;
  }
}

/** A small library document, the context of many tests. */
export const LIBRARY = parse(
  '<library xmlns:dc="urn:dc"><book id="b1" year="1965"><dc:title>Dune</dc:title><price>12</price></book>' +
    '<book id="b2"><dc:title>Emma</dc:title><price>8.5</price><!-- note --><?pi data?></book>text</library>'
);

/** An element `r` at the root of a tree with no document. */
export function elementRoot(): XdmNode {
  const builder = new TreeBuilder();
  builder.startElement(builder.names.code('r', ''));
  builder.endElement();
  return XdmNode.of(builder.finish(), 0);
}
