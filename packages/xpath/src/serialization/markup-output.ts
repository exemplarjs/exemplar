import { mapCharacters } from '@exemplarjs/writer';
import { NodeKind, type XdmNode } from '@exemplarjs/xdm';
import type { QName } from '@exemplarjs/xml';
import { Char, declarationName, isAllWhitespace, trimWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { escapeHtmlUri } from '@/functions/core/strings';
import { INDENT } from '@/functions/json/json-strings';
import type { OutputPart } from './sequence-normalization.ts';
import { expandedName, HTML5_VERSION, type SerializationParameters } from './serialization-parameters.ts';
import {
  checkXMLVersion,
  declarationsNeeded,
  encoderOf,
  namespacesOf,
  normalizedText,
  type OpenedElement,
  walkTree,
} from './xml-output.ts';

const XHTML = 'http://www.w3.org/1999/xhtml';

/** The namespaces whose elements HTML5 output writes without a prefix. */
const UNPREFIXED_IN_HTML5 = new Set([XHTML, 'http://www.w3.org/2000/svg', 'http://www.w3.org/1998/Math/MathML']);

/** A list of names written as one string, for tables that would otherwise take a line a name. */
const names = (list: string): ReadonlySet<string> => new Set(list.split(' '));

/** Elements written without an end tag (Serialization 3.1 §7.1): HTML5's void elements, and HTML 4's empty ones. */
const VOID_HTML5 = names('area base br col embed hr img input keygen link meta param source track wbr');
const EMPTY_HTML4 = names('area base basefont br col embed frame hr img input isindex link meta param');

/** Inline elements, next to which indentation adds no whitespace: HTML 4's %inline and HTML5's phrasing content. */
const INLINE = names(
  'a abbr acronym applet audio b basefont bdi bdo big br button canvas cite code data datalist del dfn em embed font i iframe img input ins kbd label map mark math meter noscript object output picture progress q ruby s samp script select slot small span strike strong sub sup svg template textarea time tt u var video wbr'
);

/** Elements inside which indentation adds nothing. */
const UNINDENTED = names('pre script style title textarea');

/** Attributes written by name alone when their value is their name: those HTML defines with one allowed value. */
const BOOLEAN_ATTRIBUTES = names(
  'allowfullscreen async autofocus autoplay checked compact controls declare default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nohref noresize noshade novalidate nowrap open playsinline readonly required reversed selected'
);

/** The attributes `escape-uri-attributes` escapes, each with the elements it is a URI on (Serialization 3.1 Appendix D). */
const URI_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    action: 'form',
    archive: 'object',
    background: 'body',
    cite: 'blockquote del ins q',
    classid: 'object',
    codebase: 'applet object',
    data: 'object',
    datasrc: 'button div input object select span table textarea',
    for: 'script',
    formaction: 'button input',
    href: 'a area base link',
    icon: 'command',
    longdesc: 'frame iframe img',
    manifest: 'html',
    name: 'a',
    poster: 'video',
    profile: 'head',
    src: 'audio embed frame iframe img input script source track video',
    usemap: 'img input object',
    value: 'input',
  }).map(([attribute, elements]) => [attribute, names(elements)])
);

/** What a serialization by the HTML or XHTML method keeps track of. */
interface Markup {
  readonly parameters: SerializationParameters;
  readonly xhtml: boolean;
  readonly html5: boolean;
  /** Matches a character the encoding cannot hold, unless it holds them all. */
  readonly unencodable: RegExp | undefined;
  readonly out: string[];
  /** How far writing has got toward the root element: nothing yet, only text, or the root written. */
  beforeRoot: 'nothing' | 'text' | 'root';
}

/** An element being written: its namespaces as written, its end tag, and how its content is written. */
interface ElementBeingWritten {
  readonly namespaces: ReadonlyMap<string, string>;
  readonly endTag: string;
  /** How deep it is, and whether its children are indented. */
  readonly depth: number;
  readonly indents: boolean;
  /** How its text is written: as it is (`script` and `style`), as CDATA, or escaped. */
  readonly textMode: 'escaped' | 'raw' | 'cdata';
}

/** No character map, for what character maps leave alone: URIs escaped and namespace declarations. */
const NO_MAP: ReadonlyMap<string, string> = new Map();

/** An element's local name, lower-cased, for the HTML tables. */
function htmlName(element: XdmNode): string {
  return element.localName.toLowerCase();
}

/** Whether an element is written by HTML's rules rather than as XML (§6 recognized, §7.1 serialized as an HTML element). */
function isHtml(element: XdmNode, markup: Markup): boolean {
  const uri = element.namespaceURI;
  // An element in no namespace is HTML to XHTML only in HTML5; any name will do, as the tables decide the rest.
  if (markup.xhtml) return uri === XHTML || (markup.html5 && uri === '');
  return uri === '' || (markup.html5 && uri === XHTML);
}

/** The entities the markup characters are written as; any other character escaped is a decimal reference. */
const ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** A character's reference. */
function reference(character: string): string {
  return ENTITIES[character] ?? `&#${character.codePointAt(0) as number};`;
}

/** The characters escaped in each place: XML's in text and XML attributes, and in HTML attributes only `&` and `"`. */
const SPECIAL = { text: /[&<>]/, 'html-attribute': /[&"]/, 'xml-attribute': /[&<"\t\n\r]/ } as const;

/** Where escaped text goes. */
type EscapePlace = keyof typeof SPECIAL;

/** Text escaped for its place, normalized and mapped; SERE0014 for a control character in HTML before HTML5. */
function escaped(
  text: string,
  place: EscapePlace,
  markup: Markup,
  characterMap = markup.parameters.characterMap
): string {
  const special = SPECIAL[place];
  return mapCharacters(normalizedText(text, markup.parameters), characterMap, (character, codePoint, whole, index) => {
    if (!markup.xhtml && !markup.html5 && codePoint >= Char.DELETE && codePoint <= Char.C1_LAST)
      dynamicError(XPathErrorCode.HTML_CONTROL_CHARACTER, `HTML before HTML5 cannot hold the character #${codePoint}`);
    // HTML leaves `&{` as it is, for the script macros of old browsers.
    if (place === 'html-attribute' && character === '&' && whole[index + 1] === '{') return '&';
    if (special.test(character) || markup.unencodable?.test(character) === true) return reference(character);
    return character;
  });
}

/** An element's or attribute's name as written: unprefixed for HTML, and in HTML5 for XHTML, SVG and MathML elements. */
function writtenName(node: XdmNode, markup: Markup, unprefixed: boolean): string {
  const dropsPrefix =
    unprefixed || (markup.html5 && node.kind === NodeKind.ELEMENT && UNPREFIXED_IN_HTML5.has(node.namespaceURI));
  return dropsPrefix ? node.localName : (node.nodeName as QName).toString();
}

/** The namespaces an element is written with: those in scope, with the default an unprefixed name needs, and without its own prefix unless an attribute uses it. */
function namespacesFor(element: XdmNode, name: string): Map<string, string> {
  const namespaces = namespacesOf(element);
  if (name.includes(':')) return namespaces;
  const prefix = (element.nodeName as QName).prefix;
  if (!element.attributes().some((attribute) => (attribute.nodeName as QName).prefix === prefix))
    namespaces.delete(prefix);
  return namespaces.set('', element.namespaceURI);
}

/** An attribute as written: by name alone for an HTML boolean attribute, a URI escaped, and HTML's escaping only for HTML's attributes. */
function attributeText(attribute: XdmNode, element: XdmNode, html: boolean, markup: Markup): string {
  const name = writtenName(attribute, markup, false);
  const value = attribute.stringValue;
  const lower = attribute.localName.toLowerCase();
  const isHtmlAttribute = html && attribute.namespaceURI === '';
  const htmlEscaping = isHtmlAttribute && !markup.xhtml;
  if (htmlEscaping && BOOLEAN_ATTRIBUTES.has(lower) && value.toLowerCase() === lower) return ` ${name}`;
  const place = htmlEscaping ? 'html-attribute' : 'xml-attribute';
  if (
    isHtmlAttribute &&
    markup.parameters.escapeURIAttributes &&
    URI_ATTRIBUTES.get(lower)?.has(htmlName(element)) === true
  )
    return ` ${name}="${escaped(escapeHtmlUri(value.normalize('NFC')), place, markup, NO_MAP)}"`;
  return ` ${name}="${escaped(value, place, markup)}"`;
}

/** A DOCTYPE identifier quoted, with single quotes when it holds a double quote. */
function quoted(literal: string): string {
  return literal.includes('"') ? `'${literal}'` : `"${literal}"`;
}

/** The DOCTYPE to write before the first element, or nothing (§6.1.7, §7.4.6). */
function doctype(element: XdmNode, name: string, html: boolean, markup: Markup): string {
  const { doctypePublic, doctypeSystem } = markup.parameters;
  const root = markup.xhtml ? name : 'html';
  const publicId = doctypePublic === undefined ? '' : ` PUBLIC ${quoted(doctypePublic)}`;
  if (doctypeSystem !== undefined) return `<!DOCTYPE ${root}${publicId || ' SYSTEM'} ${quoted(doctypeSystem)}>`;
  if (publicId !== '' && !markup.xhtml) return `<!DOCTYPE html${publicId}>`;
  const bare = markup.html5 && html && markup.beforeRoot === 'nothing' && htmlName(element) === 'html';
  return bare ? `<!DOCTYPE ${root}>` : '';
}

/** The content type `meta` element `include-content-type` adds at the start of `head`, named as the head is. */
function contentTypeMeta(headName: string, markup: Markup): string {
  const { encoding, mediaType } = markup.parameters;
  const colon = headName.indexOf(':');
  const name = colon === -1 ? 'meta' : headName.slice(0, colon + 1) + 'meta';
  return `<${name} http-equiv="Content-Type" content="${mediaType ?? 'text/html'}; charset=${encoding}"${markup.xhtml ? ' />' : '>'}`;
}

/** Whether a child is a `meta` element declaring the content type, which the added one replaces. */
function isContentTypeMeta(child: XdmNode): boolean {
  if (child.kind !== NodeKind.ELEMENT || htmlName(child) !== 'meta') return false;
  const httpEquiv = child.attributes().find((attribute) => attribute.localName.toLowerCase() === 'http-equiv');
  return httpEquiv !== undefined && trimWhitespace(httpEquiv.stringValue).toLowerCase() === 'content-type';
}

/** Whether an element's children are indented: only elements and whitespace among them, none inline, and nothing that stops it. */
function indentsChildren(element: XdmNode, html: boolean, markup: Markup): boolean {
  const { indent, suppressIndentation } = markup.parameters;
  if (!indent || (html && UNINDENTED.has(htmlName(element))) || suppressIndentation.includes(expandedName(element)))
    return false;
  return element.children().every((child) => {
    if (child.kind === NodeKind.TEXT) return isAllWhitespace(child.stringValue);
    return child.kind !== NodeKind.ELEMENT || !INLINE.has(htmlName(child));
  });
}

/** How an element's text is written: as it is in HTML's `script` and `style`, as CDATA when asked outside HTML, else escaped. */
function textModeOf(element: XdmNode, html: boolean, markup: Markup): ElementBeingWritten['textMode'] {
  if (html && !markup.xhtml) {
    const raw = htmlName(element) === 'script' || htmlName(element) === 'style';
    return raw ? 'raw' : 'escaped';
  }
  return markup.parameters.cdataSectionElements.includes(expandedName(element)) ? 'cdata' : 'escaped';
}

/** A line break and the indentation for a depth, before a child of an element that indents its children or its end tag. */
function lineBefore(parent: ElementBeingWritten | undefined, markup: Markup, extra = 1): void {
  if (parent?.indents === true) markup.out.push(`\n${INDENT.repeat(parent.depth + extra)}`);
}

/** The end of an element with no children: none for a void HTML element, else an end tag, which HTML parsers read as empty. */
function emptyEnd(element: XdmNode, name: string, html: boolean, markup: Markup): string {
  const voids = markup.html5 ? VOID_HTML5 : EMPTY_HTML4;
  if (!html || !voids.has(htmlName(element))) return `></${name}>`;
  return markup.xhtml ? ' />' : '>';
}

/** Writes the DOCTYPE before the first element, and a line after it when indenting. */
function writeDoctype(element: XdmNode, name: string, html: boolean, markup: Markup): void {
  const declared = markup.beforeRoot === 'root' ? '' : doctype(element, name, html, markup);
  if (declared !== '') markup.out.push(declared, markup.parameters.indent ? '\n' : '');
  markup.beforeRoot = 'root';
}

/** The namespace declarations an element writes beyond those written above it, their URIs escaped. */
function declarations(
  namespaces: ReadonlyMap<string, string>,
  parent: ElementBeingWritten | undefined,
  markup: Markup
): string {
  let written = '';
  for (const [prefix, uri] of declarationsNeeded(namespaces, parent?.namespaces ?? NO_MAP, false)) {
    written += ` ${declarationName(prefix)}="${escaped(uri, 'xml-attribute', markup, NO_MAP)}"`;
  }
  return written;
}

/** Writes an element's start tag, and gives what writing its content and end tag needs. */
function openElement(
  element: XdmNode,
  parent: ElementBeingWritten | undefined,
  markup: Markup
): OpenedElement<ElementBeingWritten> {
  const html = isHtml(element, markup);
  const name = writtenName(element, markup, html && !markup.xhtml);
  const namespaces = namespacesFor(element, name);
  lineBefore(parent, markup);
  writeDoctype(element, name, html, markup);
  markup.out.push(`<${name}${declarations(namespaces, parent, markup)}`);
  for (const attribute of element.attributes()) markup.out.push(attributeText(attribute, element, html, markup));
  const addsContentType = html && htmlName(element) === 'head' && markup.parameters.includeContentType;
  let children = addsContentType ? element.children().filter((child) => !isContentTypeMeta(child)) : element.children();
  const empty = children.length === 0 && !addsContentType;
  const opened: ElementBeingWritten = {
    namespaces,
    endTag: empty ? emptyEnd(element, name, html, markup) : `</${name}>`,
    depth: parent === undefined ? 0 : parent.depth + 1,
    indents: !empty && indentsChildren(element, html, markup),
    textMode: textModeOf(element, html, markup),
  };
  if (!empty) markup.out.push('>');
  if (addsContentType) {
    lineBefore(opened, markup);
    markup.out.push(contentTypeMeta(name, markup));
  }
  if (opened.indents) children = children.filter((child) => child.kind !== NodeKind.TEXT);
  return { opened, children };
}

/** Writes text, a comment or a processing instruction; SERE0015 for `>` in an HTML one, SERE0008 for what a script cannot hold. */
function writeLeaf(node: XdmNode, parent: ElementBeingWritten | undefined, markup: Markup): void {
  const text = node.stringValue;
  lineBefore(parent, markup);
  if (node.kind === NodeKind.COMMENT) markup.out.push(`<!--${text}-->`);
  else if (node.kind === NodeKind.PROCESSING_INSTRUCTION) {
    if (!markup.xhtml && text.includes('>'))
      dynamicError(XPathErrorCode.HTML_PI_GREATER_THAN, 'An HTML processing instruction cannot hold >');
    const data = text === '' ? '' : ' ' + text;
    markup.out.push(`<?${node.localName}${data}${markup.xhtml ? '?>' : '>'}`);
  } else if (parent?.textMode === 'raw') {
    if (markup.unencodable?.test(text) === true)
      dynamicError(
        XPathErrorCode.UNENCODABLE_CHARACTER,
        'A script or style element holds a character the encoding cannot'
      );
    markup.out.push(text);
  } else if (parent?.textMode === 'cdata') markup.out.push(`<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`);
  else writeText(text, parent, markup);
}

/** Writes text escaped, noting whether text came before the root element. */
function writeText(text: string, parent: ElementBeingWritten | undefined, markup: Markup): void {
  if (parent === undefined && markup.beforeRoot === 'nothing' && !isAllWhitespace(text)) markup.beforeRoot = 'text';
  markup.out.push(escaped(text, 'text', markup));
}

/** The XML declaration XHTML writes unless it is omitted. */
function xmlDeclaration({ version, encoding, standalone }: SerializationParameters): string {
  let declared = '';
  if (standalone !== undefined) declared = ` standalone="${standalone ? 'yes' : 'no'}"`;
  return `<?xml version="${version}" encoding="${encoding}"${declared}?>`;
}

/**
 * A normalized sequence written by the HTML or XHTML method (Serialization 3.1 §6, §7): void
 * elements without end tags, `script` and `style` unescaped and boolean attributes minimized in
 * HTML, a content type `meta` element, URI attributes escaped, and HTML5's DOCTYPE; elements in
 * other namespaces written as XML. SESU0007 for an encoding it lacks.
 */
export function markupOutput(
  parts: readonly OutputPart[],
  parameters: SerializationParameters,
  method: 'html' | 'xhtml'
): string {
  const { unencodable } = encoderOf(parameters);
  const { htmlVersion } = parameters;
  // HTML from 1.0 to 5.0; SESU0013 for another.
  if (htmlVersion < 1 || htmlVersion > HTML5_VERSION)
    dynamicError(XPathErrorCode.UNSUPPORTED_XML_VERSION, `HTML ${htmlVersion} is not supported`);
  const xhtml = method === 'xhtml';
  const html5 = htmlVersion >= HTML5_VERSION;
  const markup: Markup = { parameters, xhtml, html5, unencodable, out: [], beforeRoot: 'nothing' };
  if (xhtml) checkXMLVersion(parameters);
  if (xhtml && !parameters.omitXMLDeclaration) markup.out.push(xmlDeclaration(parameters));
  for (const [index, part] of parts.entries()) {
    if (parameters.indent && index > 0 && typeof part !== 'string') markup.out.push('\n');
    if (typeof part === 'string') writeText(part, undefined, markup);
    else
      walkTree<ElementBeingWritten>(part, {
        open: (element, parent) => openElement(element, parent, markup),
        leaf: (node, parent) => writeLeaf(node, parent, markup),
        close: (opened) => {
          lineBefore(opened, markup, 0);
          markup.out.push(opened.endTag);
        },
      });
  }
  return markup.out.join('');
}
