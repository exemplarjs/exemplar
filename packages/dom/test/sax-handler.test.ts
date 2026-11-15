import { DOCUMENTS } from '@test/helpers/documents';
import { serialize } from '@test/helpers/dom';
import { describe, expect, it } from 'vitest';
import { type Attributes, AttributesImpl, SAXParser, XMLFilterImpl } from '@exemplarjs/sax';
import { IllegalStateError, XMLEventFactory, XMLInputFactory } from '@exemplarjs/xml';
import {
  type Attr,
  type Document,
  DocumentBuilder,
  type DOMBuildingHandler,
  type Element,
  type Node,
  NodeType,
} from '@/index';

/** A tree built from SAX events, through the filter `wrap` puts around the handler. */
function viaSAX(
  xml: string,
  { factory = new XMLInputFactory(), builder = new DocumentBuilder(factory), wrap = (h: object) => h } = {}
): Document {
  const handler = builder.createSAXHandler();
  new SAXParser(factory).parse({ text: xml, systemId: 'file:///docs/d.xml' }, wrap(handler));
  return handler.document;
}

/** A node and everything below it as lines: type, names and value, and an element's attributes sorted. */
function dump(node: Node, depth = 0): string[] {
  const indent = ' '.repeat(depth);
  let line = `${indent}${node.nodeType} {${node.namespaceURI ?? ''}}${node.nodeName} ${JSON.stringify(node.nodeValue)}`;
  if (node.nodeType === NodeType.ELEMENT_NODE) {
    const attributes = ([...(node as Element).attributes] as Attr[]).map(
      (attr) => `{${attr.namespaceURI ?? ''}}${attr.name}=${attr.value} ${attr.isId} ${attr.specified}`
    );
    line += ` [${attributes.toSorted().join(' ')}]`;
  }
  const lines = [line];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) lines.push(...dump(child, depth + 1));
  return lines;
}

/** The error a run of events throws. */
function failure(send: (handler: DOMBuildingHandler) => void): unknown {
  try {
    send(new DocumentBuilder().createSAXHandler());
  } catch (error) {
    return error;
  }
  return undefined;
}

const NONE = new AttributesImpl();

describe('DOMBuildingHandler', () => {
  it.each(Object.entries(DOCUMENTS))('builds the root the source would: %s', (_name, xml) => {
    const fromSAX = viaSAX(xml).documentElement as Element;
    expect(dump(fromSAX)).toEqual(dump(new DocumentBuilder().parse(xml).documentElement as Element));
  });

  it('builds the document type, its entities and notations, and what lies around the root', () => {
    const xml =
      '<?p d?><!DOCTYPE r [<!--dtd--><?q?><!ENTITY t "text"><!ENTITY m "<b/>"><!ENTITY % pe "x"><!NOTATION n SYSTEM "n"><!NOTATION o PUBLIC "o"><!ENTITY u SYSTEM "u" NDATA n><!ENTITY x SYSTEM "x.xml"><!ENTITY % px SYSTEM "p.ent"><!ENTITY t "again">]><!--c--><r/>';
    const document = viaSAX(xml);
    const doctype = document.doctype;
    expect([...document.childNodes].map((child) => child.nodeName)).toEqual(['p', 'r', '#comment', 'r']);
    expect([doctype?.name, doctype?.internalSubset]).toEqual(['r', null]);
    const entities = [...(doctype?.entities ?? [])].map((entity) => `${entity.nodeName} ${entity.textContent}`);
    expect(entities).toEqual(['t text', 'm ', 'u ', 'x ']);
    expect([...(doctype?.notations ?? [])].map((notation) => notation.nodeName)).toEqual(['n', 'o']);
    expect([document.documentURI, document.xmlVersion]).toEqual(['file:///docs/d.xml', '1.0']);
  });

  it('keeps CDATA sections, unless the factory coalesces them', () => {
    const xml = '<r>a<![CDATA[<b>]]>c</r>';
    expect(serialize(viaSAX(xml))).toBe('<r>a<![CDATA[<b>]]>c</r>');
    const factory = new XMLInputFactory({ coalescing: true });
    expect((viaSAX(xml, { factory }).documentElement as Element).childNodes.length).toBe(1);
  });

  it('leaves out comments and element-content whitespace when the builder does', () => {
    const xml = '<!DOCTYPE r [<!ELEMENT r (c)*><!ELEMENT c EMPTY>]><r>\n  <!--x--><c/>\n</r>';
    const factory = new XMLInputFactory();
    const builder = new DocumentBuilder(factory, { ignoringComments: true, ignoringElementContentWhitespace: true });
    const kept = viaSAX(xml, { factory });
    const left = viaSAX(xml, { factory, builder });
    expect([
      (kept.documentElement as Element).childNodes.length,
      (left.documentElement as Element).childNodes.length,
    ]).toEqual([4, 1]);
  });

  it('makes entity reference nodes for the entities the parser skips', () => {
    const factory = new XMLInputFactory({ replaceEntityReferences: false });
    const root = viaSAX('<!DOCTYPE r [<!ENTITY e "x">]><r>&e;</r>', { factory }).documentElement as Element;
    expect([root.firstChild?.nodeType, root.firstChild?.nodeName]).toEqual([NodeType.ENTITY_REFERENCE_NODE, 'e']);
  });

  it('builds nodes without namespaces from events without them', () => {
    const factory = new XMLInputFactory({ namespaceAware: false });
    const root = viaSAX('<p:r xmlns:p="urn:p" a="1"/>', { factory }).documentElement as Element;
    expect([root.localName, root.namespaceURI, root.attributes.length]).toEqual([null, null, 2]);
  });

  it('adds each declaration once, whether the parser reports them as attributes or not', () => {
    const xml = '<r xmlns:p="urn:p" xmlns="urn:d" p:a="1"/>';
    const factory = new XMLInputFactory({ namespacePrefixes: true });
    expect(dump(viaSAX(xml, { factory }).documentElement as Element)).toEqual(
      dump(viaSAX(xml).documentElement as Element)
    );
  });

  it('builds what a filter passes on, and one document after another', () => {
    class Stamp extends XMLFilterImpl {
      override startElement(uri: string, localName: string, qName: string, attributes: Attributes): void {
        const stamped = new AttributesImpl(attributes);
        stamped.addAttribute('', 'seen', 'seen', 'CDATA', 'yes');
        super.startElement(uri, localName, qName, stamped);
      }
    }
    const handler = new DocumentBuilder().createSAXHandler();
    new SAXParser().parse('<a><b/></a>', new Stamp(handler));
    const first = handler.document;
    new SAXParser().parse('<c/>', handler);
    expect([serialize(first), serialize(handler.document)]).toEqual(['<a seen="yes"><b seen="yes"/></a>', '<c/>']);
  });

  it('forgets an unfinished DTD and CDATA section when the next document starts', () => {
    const handler = new DocumentBuilder().createSAXHandler();
    handler.startDocument();
    handler.startDTD('a', undefined, undefined);
    handler.startDocument();
    handler.startElement('', 'a', 'a', NONE);
    handler.startCDATA();
    handler.characters('lost');
    handler.startDocument();
    handler.comment('kept');
    handler.startElement('', 'r', 'r', NONE);
    handler.characters('text');
    handler.endElement('', 'r', 'r');
    handler.endDocument();
    expect(serialize(handler.document)).toBe('<!--kept--><r>text</r>');
  });

  it('fails on events that do not make a well-formed document, where the locator says', () => {
    expect(
      failure((h) => {
        h.startDocument();
        h.startElement('', 'a', 'a', NONE);
        h.endElement('', 'b', 'b');
      })
    ).toMatchObject({ code: 'WF_END_TAG_MISMATCH' });
    expect(
      failure((h) => {
        h.startDocument();
        h.characters('text');
      })
    ).toMatchObject({ code: 'WF_CONTENT_OUTSIDE_ROOT' });
    expect(
      failure((h) => {
        h.startDocument();
        h.startElement('', '', 'a b', NONE);
      })
    ).toMatchObject({ code: 'WF_NAME' });
    const located = failure((h) => {
      h.setDocumentLocator({ lineNumber: 4, columnNumber: 2, systemId: 'file:///x.xml', xmlVersion: '1.0' });
      h.startDocument();
      h.endDocument();
    });
    expect(located).toMatchObject({ code: 'WF_EMPTY_DOCUMENT', line: 4, column: 2, systemId: 'file:///x.xml' });
    const unnamed = failure((h) => {
      h.setDocumentLocator({ lineNumber: 1, columnNumber: 1, systemId: undefined, xmlVersion: '1.0' });
      h.startDocument();
      h.endDocument();
    });
    expect(unnamed).toMatchObject({ code: 'WF_EMPTY_DOCUMENT', line: 1 });
  });

  it('joins the text of one CDATA section and of one run of text, and keeps a declaration a filter adds as an attribute', () => {
    const handler = new DocumentBuilder().createSAXHandler();
    const declaring = new AttributesImpl();
    declaring.addAttribute('http://www.w3.org/2000/xmlns/', 'p', 'xmlns:p', 'CDATA', 'urn:p');
    handler.startDocument();
    handler.startElement('', 'a', 'a', declaring);
    handler.startCDATA();
    handler.characters('x');
    handler.characters('y');
    handler.endCDATA();
    handler.characters('z');
    handler.characters('w');
    handler.endElement('', 'a', 'a');
    handler.endDocument();
    expect(serialize(handler.document)).toBe('<a xmlns:p="urn:p"><![CDATA[xy]]>zw</a>');
    expect(handler.document.documentElement?.childNodes.length).toBe(2);
  });

  it('leaves out declarations that come outside the DTD', () => {
    const handler = new DocumentBuilder().createSAXHandler();
    handler.startDocument();
    handler.notationDecl('n', undefined, 'n');
    handler.unparsedEntityDecl('u', undefined, 'u', 'n');
    handler.startElement('', 'a', 'a', NONE);
    handler.endElement('', 'a', 'a');
    handler.endDocument();
    expect(handler.document.doctype).toBeNull();
  });

  it('passes over whitespace and skipped entities outside the root', () => {
    const handler = new DocumentBuilder().createSAXHandler();
    handler.startDocument();
    handler.characters('\n');
    handler.ignorableWhitespace('\n');
    handler.skippedEntity('e');
    handler.startElement('', 'a', 'a', NONE);
    handler.endElement('', 'a', 'a');
    handler.endDocument();
    expect([...handler.document.childNodes].map((child) => child.nodeName)).toEqual(['a']);
  });

  it('refuses events before startDocument, and its document before endDocument', () => {
    expect(failure((h) => h.startElement('', 'a', 'a', NONE))).toBeInstanceOf(IllegalStateError);
    expect(
      failure((h) => {
        h.startDocument();
        return h.document;
      })
    ).toBeInstanceOf(Error);
  });
});

describe('DocumentBuilder.build: from event objects', () => {
  const events = new XMLEventFactory();
  const builder = new DocumentBuilder();

  it('builds the tree an event reader’s events describe', () => {
    const xml = '<r xmlns:p="urn:p"><p:a x="1">t<![CDATA[c]]></p:a><!--k--></r>';
    const built = builder.build(new XMLInputFactory().createEventReader(xml));
    expect(dump(built.documentElement as Element)).toEqual(dump(builder.parse(xml).documentElement as Element));
  });

  it('builds a document of one element, and from events as they arrive', async () => {
    const built = builder.build([events.createStartElement('', '', 'a'), events.createEndElement('', '', 'a')]);
    expect(serialize(built)).toBe('<a/>');
    const reader = new XMLInputFactory().createAsyncEventReader(new TextEncoder().encode('<b>x</b>'));
    expect(serialize(await builder.buildAsync(reader))).toBe('<b>x</b>');
  });
});
