import { describe, expect, it } from 'vitest';
import { type Attributes, AttributesImpl, SAXParser, XMLFilterImpl } from '@exemplarjs/sax';
import { XMLInputFactory } from '@exemplarjs/xml';
import { StringSink, XMLOutputFactory } from '@/index';

/** What a document's SAX events write, through the filter `wrap` puts around the handler. */
function written(
  xml: string,
  {
    factory = new XMLInputFactory(),
    output = new XMLOutputFactory({ omitXMLDeclaration: true }),
    wrap = (h: object) => h,
  } = {}
): string {
  const sink = new StringSink();
  new SAXParser(factory).parse(xml, wrap(output.createSAXHandler(sink)));
  return sink.toString();
}

describe('WritingHandler', () => {
  it.each([
    [
      '<r xmlns="urn:d" xmlns:p="urn:p" p:a="1" b="2">t<p:s/><x xmlns="">y</x></r>',
      '<r xmlns="urn:d" xmlns:p="urn:p" p:a="1" b="2">t<p:s/><x xmlns="">y</x></r>',
    ],
    [
      '<?p d?><!--c--><r><![CDATA[<b>]]>&amp;</r><!--after-->',
      '<?p d?><!--c--><r><![CDATA[<b>]]>&amp;</r><!--after-->',
    ],
    ['<!DOCTYPE r [<!--dtd--><?pi in dtd?><!ENTITY e "x">]><r>&e;</r>', '<r>x</r>'],
    ['<!DOCTYPE r SYSTEM "r.dtd"><r/>', '<!DOCTYPE r SYSTEM "r.dtd"><r/>'],
    ['<!DOCTYPE r PUBLIC "-//P" "r.dtd"><r/>', '<!DOCTYPE r PUBLIC "-//P" "r.dtd"><r/>'],
  ])('writes the document its events describe: %s', (xml, expected) => {
    expect(written(xml)).toBe(expected);
  });

  it('writes the XML declaration with the version the locator gives', () => {
    expect(written('<?xml version="1.1"?><r/>', { output: new XMLOutputFactory() })).toBe(
      '<?xml version="1.1" encoding="UTF-8"?><r/>'
    );
  });

  it('writes declarations once, whether the parser reports them as attributes or not', () => {
    const xml = '<r xmlns:p="urn:p" xmlns="urn:d" p:a="1"/>';
    const factory = new XMLInputFactory({ namespacePrefixes: true });
    expect(written(xml, { factory })).toBe(written(xml));
  });

  it('writes elements and attributes without namespaces from events without them', () => {
    const factory = new XMLInputFactory({ namespaceAware: false });
    const output = new XMLOutputFactory({ omitXMLDeclaration: true, namespaceAware: false });
    expect(written('<p:r xmlns:p="urn:p" a="1"/>', { factory, output })).toBe('<p:r xmlns:p="urn:p" a="1"/>');
  });

  it('declares a prefix a filter moves an element or attribute into, and keeps a declaration it adds', () => {
    class IntoNamespace extends XMLFilterImpl {
      override startElement(_uri: string, localName: string, _qName: string, attributes: Attributes): void {
        const changed = new AttributesImpl(attributes);
        changed.addAttribute('urn:m', 'mark', 'm:mark', 'CDATA', 'yes');
        changed.addAttribute('http://www.w3.org/2000/xmlns/', 'q', 'xmlns:q', 'CDATA', 'urn:q');
        super.startElement('urn:n', localName, `n:${localName}`, changed);
      }

      override endElement(_uri: string, localName: string): void {
        super.endElement('urn:n', localName, `n:${localName}`);
      }
    }
    expect(written('<r/>', { wrap: (handler) => new IntoNamespace(handler) })).toBe(
      '<n:r xmlns:n="urn:n" xmlns:m="urn:m" m:mark="yes" xmlns:q="urn:q"/>'
    );
  });

  it('leaves out the entity references a parser skips, which nothing it writes declares', () => {
    const factory = new XMLInputFactory({ replaceEntityReferences: false });
    expect(written('<!DOCTYPE r [<!ENTITY e "x">]><r>&e;</r>', { factory })).toBe('<r/>');
  });

  it('writes ignorable whitespace as text, and an empty CDATA section', () => {
    const sink = new StringSink();
    const handler = new XMLOutputFactory({ omitXMLDeclaration: true }).createSAXHandler(sink);
    handler.startDocument();
    handler.startElement('', '', 'r', new AttributesImpl());
    handler.ignorableWhitespace(' ');
    handler.startCDATA();
    handler.endCDATA();
    // An end with no start writes an empty section too.
    handler.endCDATA();
    handler.endElement('', '', 'r');
    handler.endDocument();
    expect(sink.toString()).toBe('<r> <![CDATA[]]><![CDATA[]]></r>');
  });

  it('closes a web stream it writes to', async () => {
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array>({ write: (chunk) => void chunks.push(chunk) });
    const handler = new XMLOutputFactory({ omitXMLDeclaration: true }).createSAXHandler(stream);
    new SAXParser().parse('<r>x</r>', handler);
    await handler.close();
    expect(chunks.map((chunk) => new TextDecoder().decode(chunk)).join('')).toBe('<r>x</r>');
  });

  it('refuses an end tag that does not match the open element, as a filter renaming only start tags gives', () => {
    class RenamingStarts extends XMLFilterImpl {
      override startElement(uri: string, localName: string, qName: string, attributes: Attributes): void {
        super.startElement(uri, qName === 'b' ? 'c' : localName, qName === 'b' ? 'c' : qName, attributes);
      }
    }
    expect(() => written('<a><b/></a>', { wrap: (h) => new RenamingStarts(h) })).toThrow(
      expect.objectContaining({ code: 'WRITE_STATE', message: 'The end tag b does not match the open element c' })
    );
    const repairing = new XMLOutputFactory({ omitXMLDeclaration: true, repairNamespaces: true });
    expect(written('<p:a xmlns:p="urn:p"/>', { output: repairing })).toBe('<p:a xmlns:p="urn:p"/>');
  });

  it('refuses what the stream writer refuses', () => {
    const sink = new StringSink();
    const handler = new XMLOutputFactory().createSAXHandler(sink);
    handler.startDocument();
    expect(() => handler.endDocument()).toThrow(expect.objectContaining({ code: 'WRITE_STATE' }));
  });
});
