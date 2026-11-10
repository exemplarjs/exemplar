import { type Encoder, encoderFor, type StreamWriter, StringSink, XMLOutputFactory } from '@exemplarjs/writer';
import { inScopeNamespaces, NodeKind, type XdmNode } from '@exemplarjs/xdm';
import type { QName } from '@exemplarjs/xml';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { INDENT } from '@/functions/json/json-strings';
import type { OutputPart } from './sequence-normalization.ts';
import type { SerializationParameters } from './serialization-parameters.ts';

/** The XML versions the XML method writes. */
const XML_VERSIONS = new Set(['1.0', '1.1']);

/** No namespaces, as the top of the output has. */
const NO_NAMESPACES: ReadonlyMap<string, string> = new Map();

/** Text in the normalization form the parameters ask for. */
export function normalizedText(text: string, parameters: SerializationParameters): string {
  const form = parameters.normalizationForm;
  return form === undefined ? text : text.normalize(form);
}

/** A stream writer into a string sink, with the XML method's settings from the parameters; SESU0007 for an encoding it lacks. */
function writerFor(parameters: SerializationParameters, sink: StringSink): StreamWriter {
  const factory = new XMLOutputFactory({
    ...(parameters.indent && { indent: INDENT }),
    omitXMLDeclaration: parameters.omitXMLDeclaration,
    version: parameters.version as '1.0',
    ...(parameters.doctypePublic !== undefined && { doctypePublic: parameters.doctypePublic }),
    ...(parameters.doctypeSystem !== undefined && { doctypeSystem: parameters.doctypeSystem }),
    cdataSectionElements: parameters.cdataSectionElements,
    suppressIndentation: parameters.suppressIndentation,
    characterMap: Object.fromEntries(parameters.characterMap),
    // A serialization may hold several elements and text at the top, which a document may not.
    checkWellFormedness: false,
  });
  encoderOf(parameters);
  return factory.createStreamWriter(sink, { encoding: parameters.encoding });
}

/** The writer's encoder for the parameters' encoding; SESU0007 for one it does not have. */
export function encoderOf(parameters: SerializationParameters): Encoder {
  try {
    return encoderFor(parameters.encoding);
  } catch {
    // encoderFor raises only for an encoding it does not have.
    return dynamicError(
      XPathErrorCode.UNSUPPORTED_OUTPUT_ENCODING,
      `The encoding ${parameters.encoding} is not supported`
    );
  }
}

/** An element's namespaces in scope, by prefix. */
export function namespacesOf(element: XdmNode): Map<string, string> {
  return new Map(inScopeNamespaces(element.tree, element.index).map(({ prefix, uri }) => [prefix, uri]));
}

/** The declarations an element needs beyond those above it, `''` the default: its own that differ, and undeclarations of what it lacks. */
export function* declarationsNeeded(
  own: ReadonlyMap<string, string>,
  inherited: ReadonlyMap<string, string>,
  undeclarePrefixes: boolean
): Generator<readonly [string, string]> {
  for (const [prefix, uri] of own) {
    // No default namespace above is the same as none.
    const above = inherited.get(prefix) ?? (prefix === '' ? '' : undefined);
    if (prefix !== 'xml' && above !== uri) yield [prefix, uri];
  }
  if ((inherited.get('') ?? '') !== '' && !own.has('')) yield ['', ''];
  if (!undeclarePrefixes) return;
  for (const prefix of inherited.keys()) if (prefix !== '' && !own.has(prefix)) yield [prefix, ''];
}

/** An element a walk has opened: what writing its content and end tag needs, and the children to visit. */
export interface OpenedElement<Open> {
  readonly opened: Open;
  readonly children: readonly XdmNode[];
}

/** What a walk over a tree does: open an element, giving what its content needs and the children to visit; write a leaf; close an element. */
export interface TreeVisitor<Open> {
  open(element: XdmNode, parent: Open | undefined): OpenedElement<Open>;

  leaf(node: XdmNode, parent: Open | undefined): void;

  close(opened: Open): void;
}

/** Visits a node and everything below it, an element at a time rather than by recursion, so that no tree is too deep. */
export function walkTree<Open>(root: XdmNode, visitor: TreeVisitor<Open>): void {
  const openElements: (OpenedElement<Open> & { next: number })[] = [];
  let node: XdmNode | undefined = root;
  while (node !== undefined) {
    const parent = openElements.at(-1)?.opened;
    if (node.kind === NodeKind.ELEMENT) openElements.push({ ...visitor.open(node, parent), next: 0 });
    else visitor.leaf(node, parent);
    node = undefined;
    // The next child of the innermost open element, closing each element whose children are visited.
    for (
      let current = openElements.at(-1);
      node === undefined && current !== undefined;
      current = openElements.at(-1)
    ) {
      node = current.children[current.next++];
      if (node === undefined) {
        visitor.close(current.opened);
        openElements.pop();
      }
    }
  }
}

/** Writes an element's start tag: its name, namespace declarations and attributes. */
function writeStartTag(
  writer: StreamWriter,
  element: XdmNode,
  own: ReadonlyMap<string, string>,
  inherited: ReadonlyMap<string, string>,
  parameters: SerializationParameters
): void {
  writer.writeStartElement(element.nodeName as QName);
  for (const [prefix, uri] of declarationsNeeded(own, inherited, parameters.undeclarePrefixes))
    writer.writeNamespace(prefix, uri);
  for (const attribute of element.attributes())
    writer.writeAttribute(attribute.nodeName as QName, normalizedText(attribute.stringValue, parameters));
}

/** Writes a node that holds no other nodes: text, a comment or a processing instruction. */
function writeLeaf(writer: StreamWriter, node: XdmNode, parameters: SerializationParameters): void {
  if (node.kind === NodeKind.TEXT) writer.writeCharacters(normalizedText(node.stringValue, parameters));
  else if (node.kind === NodeKind.COMMENT) writer.writeComment(node.stringValue);
  else writer.writeProcessingInstruction(node.localName, node.stringValue);
}

/** Writes a node and everything below it through a stream writer. */
function writeTree(writer: StreamWriter, root: XdmNode, parameters: SerializationParameters): void {
  walkTree<ReadonlyMap<string, string>>(root, {
    open(element, inherited) {
      const own = namespacesOf(element);
      writeStartTag(writer, element, own, inherited ?? NO_NAMESPACES, parameters);
      return { opened: own, children: element.children() };
    },
    leaf: (node) => writeLeaf(writer, node, parameters),
    close: () => writer.writeEndElement(),
  });
}

/** Raises SESU0013 for an XML version the XML and XHTML methods do not write. */
export function checkXMLVersion(parameters: SerializationParameters): void {
  if (!XML_VERSIONS.has(parameters.version))
    dynamicError(XPathErrorCode.UNSUPPORTED_XML_VERSION, `XML ${parameters.version} is not supported`);
}

/** A normalized sequence written by the XML method; SESU0013 for an XML version it does not write, SEPM0010 for undeclaring prefixes in XML 1.0. */
export function xmlOutput(parts: readonly OutputPart[], parameters: SerializationParameters): string {
  checkXMLVersion(parameters);
  if (parameters.undeclarePrefixes && parameters.version === '1.0')
    dynamicError(XPathErrorCode.UNDECLARE_PREFIXES_IN_XML_10, 'XML 1.0 cannot undeclare a prefix');
  const sink = new StringSink();
  const writer = writerFor(parameters, sink);
  writer.writeStartDocument(parameters.version, parameters.encoding, parameters.standalone);
  for (const part of parts) {
    if (typeof part === 'string') writer.writeCharacters(normalizedText(part, parameters));
    else writeTree(writer, part, parameters);
  }
  writer.writeEndDocument();
  return sink.toString();
}
