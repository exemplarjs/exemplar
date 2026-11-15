import { dump, labels } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { type Attributes, AttributesImpl, SAXParser, XMLFilterImpl } from '@exemplarjs/sax';
import {
  EventType,
  IllegalStateError,
  InvalidArgumentError,
  type XMLEvent,
  XMLEventFactory,
  XMLInputFactory,
} from '@exemplarjs/xml';
import { XdmDocumentBuilder, type XdmNode } from '@/index';

const builder = new XdmDocumentBuilder();

/** A tree built from SAX events, through the filters `filter` wraps around the handler. */
function viaSAX(
  xml: string,
  filter: (handler: XMLFilterImpl['handler']) => XMLFilterImpl['handler'] = (h) => h,
  factory = new XMLInputFactory()
): XdmNode {
  const handler = builder.createSAXHandler();
  new SAXParser(factory).parse({ text: xml, systemId: 'file:///docs/d.xml' }, filter(handler));
  return handler.document;
}

/** Sends events straight to a handler, with no parser. */
function events(send: (handler: ReturnType<XdmDocumentBuilder['createSAXHandler']>) => void): unknown {
  try {
    send(builder.createSAXHandler());
  } catch (error) {
    return error;
  }
  return undefined;
}

const NONE = new AttributesImpl();

describe('XdmBuildingHandler', () => {
  it.each([
    '<?p d?><!--c--><r xmlns="urn:d" xmlns:p="urn:p" p:a="1" b="2">t<![CDATA[&]]><p:s/><x xmlns="">y</x></r><!--after-->',
    '<!DOCTYPE r [<!--in the DTD--><?in dtd?><!ATTLIST r i ID #IMPLIED><!ENTITY e "<i>x</i>">]><r i="k">&e;</r>',
  ])('builds the tree the source would: %s', (xml) => {
    expect(dump(viaSAX(xml))).toEqual(dump(builder.parse(xml)));
  });

  it('takes the document URI from the locator, and the unparsed entities from the DTD', () => {
    const document = viaSAX('<!DOCTYPE r [<!NOTATION n SYSTEM "n"><!ENTITY u SYSTEM "u.bin" NDATA n>]><r/>');
    expect([document.documentURI, document.unparsedEntitySystemId('u')]).toEqual([
      'file:///docs/d.xml',
      'file:///docs/u.bin',
    ]);
  });

  it('gives the elements at the top of an external entity its URI as their base', () => {
    const factory = new XMLInputFactory({
      accessExternalEntities: 'all',
      entityResolver: {
        resolveEntity: (request) => ({
          text: '<i>x</i><?pi d?>',
          systemId: new URL(request.systemId ?? '', request.baseURI).href,
        }),
      },
    });
    const xml = '<!DOCTYPE r [<!ENTITY e SYSTEM "sub/e.xml"><!ENTITY % p "<!ENTITY t \'t\'>"> %p;]><r>&e;</r>';
    const document = viaSAX(xml, undefined, factory);
    const [item, instruction] = (document.children()[0] as XdmNode).children() as [XdmNode, XdmNode];
    expect([item.baseURI, instruction.baseURI]).toEqual(['file:///docs/sub/e.xml', 'file:///docs/sub/e.xml']);
  });

  it('builds what a filter passes on, declaring a prefix it moves an element into', () => {
    class IntoNamespace extends XMLFilterImpl {
      override startElement(_uri: string, localName: string, _qName: string, attributes: Attributes): void {
        super.startElement('urn:n', localName, `n:${localName}`, attributes);
      }

      override endElement(_uri: string, localName: string): void {
        super.endElement('urn:n', localName, `n:${localName}`);
      }
    }
    const document = viaSAX('<r><s/></r>', (handler) => new IntoNamespace(handler));
    const root = document.children()[0] as XdmNode;
    expect([root.nodeName?.toString(), root.namespaceURI]).toEqual(['n:r', 'urn:n']);
    expect(
      root
        .namespaceNodes()
        .map((namespace) => namespace.localName)
        .toSorted()
    ).toEqual(['n', 'xml']);
    expect(labels(root.children())).toEqual(['element n:s']);
  });

  it('leaves out declarations a parser reports as attributes, which the mappings carry', () => {
    const xml = '<r xmlns:p="urn:p" xmlns="urn:d" p:a="1"/>';
    const document = viaSAX(xml, undefined, new XMLInputFactory({ namespacePrefixes: true }));
    expect(dump(document)).toEqual(dump(builder.parse(xml)));
  });

  it('builds one document after another', () => {
    const handler = builder.createSAXHandler();
    const parser = new SAXParser();
    parser.parse('<a/>', handler);
    const first = handler.document;
    parser.parse('<b>x</b>', handler);
    expect([labels(first.children()), handler.document.stringValue]).toEqual([['element a'], 'x']);
  });

  it('forgets one document’s DTD when the next starts', () => {
    const handler = builder.createSAXHandler();
    handler.startDocument();
    handler.startDTD();
    handler.externalEntityDecl('e');
    handler.setDocumentLocator({ lineNumber: 1, columnNumber: 1, systemId: 'file:///e.xml', xmlVersion: '1.0' });
    handler.startDocument();
    handler.startElement('', 'r', 'r', NONE);
    handler.startEntity('e');
    handler.startElement('', 'a', 'a', NONE);
    handler.endElement('', 'a', 'a');
    handler.endEntity();
    handler.comment('kept');
    handler.endElement('', 'r', 'r');
    handler.endDocument();
    const root = handler.document.children()[0] as XdmNode;
    expect(labels(root.children())).toEqual(['element a', 'comment(kept)']);
    expect((root.children()[0] as XdmNode).baseURI).toBe(root.baseURI);
  });

  it('fails on events that do not make a well-formed document', () => {
    expect(
      events((h) => {
        h.startDocument();
        h.startElement('', 'a', 'a', NONE);
        h.endElement('', 'b', 'b');
      })
    ).toMatchObject({ code: 'WF_END_TAG_MISMATCH' });
    expect(
      events((h) => {
        h.startDocument();
        h.characters('text');
      })
    ).toMatchObject({ code: 'WF_CONTENT_OUTSIDE_ROOT' });
    expect(
      events((h) => {
        h.startDocument();
        h.endDocument();
      })
    ).toMatchObject({ code: 'WF_EMPTY_DOCUMENT', line: 0 });
    expect(
      events((h) => {
        h.startDocument();
        h.startElement('', 'b', 'a', NONE);
      })
    ).toMatchObject({ code: 'NS_QNAME' });
  });

  it('reports where a failure is when its locator has no system id', () => {
    expect(
      events((h) => {
        h.setDocumentLocator({ lineNumber: 2, columnNumber: 5, systemId: undefined, xmlVersion: '1.0' });
        h.startDocument();
        h.endDocument();
      })
    ).toMatchObject({ code: 'WF_EMPTY_DOCUMENT', line: 2, column: 5 });
  });

  it('reports where a failure is when it has a locator', () => {
    expect(
      events((h) => {
        h.setDocumentLocator({ lineNumber: 2, columnNumber: 5, systemId: 'file:///x.xml', xmlVersion: '1.0' });
        h.startDocument();
        h.endDocument();
      })
    ).toMatchObject({ code: 'WF_EMPTY_DOCUMENT', line: 2, column: 5, systemId: 'file:///x.xml' });
  });

  it('passes over whitespace outside the root', () => {
    const handler = builder.createSAXHandler();
    handler.startDocument();
    handler.ignorableWhitespace('\n');
    handler.startElement('', 'a', 'a', NONE);
    handler.endElement('', 'a', 'a');
    handler.endDocument();
    expect(labels(handler.document.children())).toEqual(['element a']);
  });

  it('refuses events without namespaces, events before startDocument, and its document before endDocument', () => {
    expect(viaSAXError('<a/>', new XMLInputFactory({ namespaceAware: false }))).toBeInstanceOf(InvalidArgumentError);
    expect(events((h) => h.startElement('', 'a', 'a', NONE))).toBeInstanceOf(IllegalStateError);
    expect(
      events((h) => {
        h.startDocument();
        return h.document;
      })
    ).toBeInstanceOf(Error);
  });
});

/** The error building from SAX events throws. */
function viaSAXError(xml: string, factory: XMLInputFactory): unknown {
  try {
    viaSAX(xml, undefined, factory);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('XdmDocumentBuilder.build: from event objects', () => {
  const events = new XMLEventFactory();

  it('builds the tree an event reader’s events describe, and those a generator changes', () => {
    const xml = '<r xmlns:p="urn:p"><p:a x="1">t</p:a><!--c--></r>';
    const factory = new XMLInputFactory();
    const built = builder.build(factory.createEventReader(xml));
    expect(dump(built)).toEqual(dump(builder.parse(xml)));
    function* upper(input: Iterable<XMLEvent>): Generator<XMLEvent> {
      for (const event of input)
        yield event.type === EventType.CHARACTERS ? events.createCharacters(event.text.toUpperCase()) : event;
    }
    const changed = upper(factory.createEventReader(xml));
    expect(builder.build(changed).stringValue).toBe('T');
  });

  it('builds a document of one element from events that start with its start tag', () => {
    const document = builder.build([
      events.createStartElement('', '', 'a'),
      events.createCharacters('x'),
      events.createEndElement('', '', 'a'),
    ]);
    expect([labels(document.children()), document.stringValue]).toEqual([['element a'], 'x']);
  });

  it('builds from events as they arrive', async () => {
    const reader = new XMLInputFactory().createAsyncEventReader(new TextEncoder().encode('<a>x</a>'));
    const document = await builder.buildAsync(reader);
    expect(document.stringValue).toBe('x');
  });

  it('fails on events that do not balance', () => {
    expect(() => builder.build([events.createStartElement('', '', 'a'), events.createEndElement('', '', 'b')])).toThrow(
      expect.objectContaining({ code: 'WF_END_TAG_MISMATCH' })
    );
  });
});
