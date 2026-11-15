import { resolver, spaceValidator } from '@test/helpers/resolver';
import { at, labels, parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import type { XdmNode } from '@/index';

describe('CursorLoader', () => {
  it('joins text, CDATA sections and entity text into one text node', () => {
    const document = parse('<!DOCTYPE a [<!ENTITY e "entity">]><a>one<![CDATA[<two>]]>&e;&amp;&#33;</a>');
    expect(labels(at(document, 0).children())).toEqual(['text(one<two>entity&!)']);
  });

  it('expands entities holding markup', () => {
    const document = parse('<!DOCTYPE a [<!ENTITY e "x<b>y</b>z">]><a>&e;</a>');
    expect(labels(at(document, 0).children())).toEqual(['text(x)', 'element b', 'text(z)']);
  });

  it('makes no node for a reference to an entity it did not read', () => {
    const document = parse('<!DOCTYPE a SYSTEM "a.dtd"><a>x&unknown;y</a>');
    expect(labels(at(document, 0).children())).toEqual(['text(xy)']);
  });

  it('keeps comments and processing instructions, outside the root too, but not the DTD or whitespace there', () => {
    const document = parse(
      '<?xml version="1.0"?>\n<!--a-->\n<!DOCTYPE r [<!--in dtd--><?in dtd?>]>\n<?b c?>\n<r/>\n<!--d-->\n'
    );
    expect(labels(document.children())).toEqual(['comment(a)', 'processing-instruction b', 'element r', 'comment(d)']);
  });

  it('keeps whitespace a validator reports as ignorable', () => {
    const document = parse('<a> <b/> </a>', { validator: spaceValidator });
    expect(labels(at(document, 0).children())).toEqual(['text( )', 'element b', 'text( )']);
  });

  it('keeps namespace declarations, not as attributes', () => {
    const a = at(parse('<a xmlns="urn:a" xmlns:p="urn:p" p:x="1"/>'), 0);
    expect(labels(a.attributes())).toEqual(['attribute p:x']);
    expect(a.namespaceNodes().map((node) => node.stringValue)).toEqual([
      'http://www.w3.org/XML/1998/namespace',
      'urn:a',
      'urn:p',
    ]);
  });

  it('gives each attribute its namespace, switching back and forth', () => {
    const a = at(parse('<a xmlns:p="urn:p" xmlns:q="urn:q" p:x="1" y="2" q:z="3" p:w="4"/>'), 0);
    expect(a.attributes().map((attribute) => attribute.namespaceURI)).toEqual(['urn:p', '', 'urn:q', 'urn:p']);
  });

  it('marks ID and IDREF attributes from the DTD, and xml:id', () => {
    const document = parse(
      '<!DOCTYPE a [<!ATTLIST a id ID #IMPLIED r IDREF #IMPLIED rs IDREFS #IMPLIED n NMTOKEN #IMPLIED>]>' +
        '<a id="i" r="i" rs="i i" n="t" xml:id="j" c="x"/>'
    );
    const attributes = at(document, 0).attributes();
    expect(attributes.map((attribute) => [attribute.localName, attribute.isId, attribute.isIdrefs])).toEqual([
      ['id', true, false],
      ['r', false, true],
      ['rs', false, true],
      ['n', false, false],
      ['id', true, false],
      ['c', false, false],
    ]);
  });

  it('records unparsed entities, leaving out parameter and internal entities', () => {
    const document = parse({
      systemId: 'http://example.com/dir/doc.xml',
      text:
        '<!DOCTYPE a [<!NOTATION n SYSTEM "n"><!ENTITY % pe SYSTEM "pe.ent"><!ENTITY i "text">' +
        '<!ENTITY ext SYSTEM "ext.xml"><!ENTITY u SYSTEM "u.bin" NDATA n>]><a/>',
    });
    expect(document.tree.unparsedEntities).toEqual(
      new Map([['u', { systemId: 'http://example.com/dir/u.bin', publicId: '' }]])
    );
  });

  it('keeps a relative system id it cannot resolve', () => {
    const document = parse('<!DOCTYPE a [<!NOTATION n SYSTEM "n"><!ENTITY u SYSTEM "u.bin" NDATA n>]><a/>');
    expect(document.unparsedEntitySystemId('u')).toBe('u.bin');
  });

  it('reads external entities through the resolver', () => {
    const document = parse('<!DOCTYPE a [<!ENTITY e SYSTEM "e.xml">]><a>&e;</a>', {
      entityResolver: resolver({ 'e.xml': 'text <b/>' }),
      accessExternalEntities: 'all',
    });
    const a = at(document, 0);
    expect(labels(a.children())).toEqual(['text(text )', 'element b']);
    expect((a.children()[1] as XdmNode).baseURI).toBe('file:///ext/e.xml');
  });

  it('gives an element from an external entity no base URI of its own when the resolver gives none', () => {
    const document = parse('<!DOCTYPE a [<!ENTITY e SYSTEM "e.xml">]><a>&e;</a>', {
      entityResolver: { resolveEntity: () => ({ text: '<b/>' }) },
      accessExternalEntities: 'all',
    });
    expect(at(document, 0, 0).baseURI).toBeNull();
  });
});
