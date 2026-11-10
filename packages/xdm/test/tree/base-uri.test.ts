import { resolver } from '@test/helpers/resolver';
import { at, parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { baseURI, NodeKind, TreeBuilder } from '@/index';

describe('baseURI', () => {
  it('is the document URI without xml:base', () => {
    const document = parse({ systemId: 'http://example.com/doc.xml', text: '<a>text<!--c--><?p?></a>' });
    expect([0, 1, 2, 3, 4].map((node) => baseURI(document.tree, node))).toEqual(
      Array.from({ length: 5 }, () => 'http://example.com/doc.xml')
    );
  });

  it('is null when nothing gives one', () => {
    expect(baseURI(parse('<a/>').tree, 1)).toBeNull();
  });

  it('resolves xml:base attributes from the top down', () => {
    const document = parse({
      systemId: 'http://example.com/dir/doc.xml',
      text: '<a xml:base="sub/"><b xml:base="deeper/x.xml">t</b><c xml:base="/root/"/><d xml:base="has space/"/></a>',
    });
    const tree = document.tree;
    expect(baseURI(tree, at(document, 0).index)).toBe('http://example.com/dir/sub/');
    expect(baseURI(tree, at(document, 0, 0).index)).toBe('http://example.com/dir/sub/deeper/x.xml');
    expect(baseURI(tree, at(document, 0, 0).index + 1)).toBe('http://example.com/dir/sub/deeper/x.xml');
    expect(baseURI(tree, at(document, 0, 1).index)).toBe('http://example.com/root/');
    expect(baseURI(tree, at(document, 0, 2).index)).toBe('http://example.com/dir/sub/has%20space/');
  });

  it('keeps an xml:base that cannot be resolved', () => {
    const document = parse('<a xml:base="relative/"><b/></a>');
    expect(baseURI(document.tree, at(document, 0, 0).index)).toBe('relative/');
  });

  it('takes a base URI the source gives over its system id', () => {
    const document = parse({ systemId: 'http://example.com/a.xml', baseURI: 'http://other.com/', text: '<a/>' });
    expect([document.baseURI, document.documentURI]).toEqual(['http://other.com/', 'http://example.com/a.xml']);
  });

  it('gives elements at the top of an external entity its URI', () => {
    const document = parse(
      {
        systemId: 'http://example.com/doc.xml',
        text: '<!DOCTYPE a [<!ENTITY e SYSTEM "dir/e.xml"><!ENTITY i "<in/>&e;">]><a>&e;&i;<c/></a>',
      },
      {
        entityResolver: resolver({ 'dir/e.xml': '<e xml:base="x/"><f/></e>' }, 'http://example.com/'),
        accessExternalEntities: 'all',
      }
    );
    const [e, inner, e2, c] = [at(document, 0, 0), at(document, 0, 1), at(document, 0, 2), at(document, 0, 3)];
    expect([e.localName, inner.localName, e2.localName, c.localName]).toEqual(['e', 'in', 'e', 'c']);
    expect(e.baseURI).toBe('http://example.com/dir/x/');
    expect(at(e, 0).baseURI).toBe('http://example.com/dir/x/');
    expect(inner.baseURI).toBe('http://example.com/doc.xml');
    expect(e2.baseURI).toBe('http://example.com/dir/x/');
    expect(c.baseURI).toBe('http://example.com/doc.xml');
  });

  it('stops at a parentless element', () => {
    const builder = new TreeBuilder();
    builder.startElement(builder.names.code('a', ''));
    builder.endElement();
    expect(baseURI(builder.finish(), 0)).toBeNull();
  });

  it('gives a processing instruction at the top of an external entity its URI', () => {
    const document = parse(
      {
        systemId: 'http://example.com/doc.xml',
        text: '<!DOCTYPE a [<!ENTITY e SYSTEM "dir/e.xml">]><a>&e;<?q y?></a>',
      },
      {
        entityResolver: resolver({ 'dir/e.xml': '<?pi x?>text<!--c--><e/>' }, 'http://example.com/'),
        accessExternalEntities: 'all',
      }
    );
    const [pi, comment, , outside] = at(document, 0)
      .children()
      .filter((child) => child.kind !== NodeKind.TEXT);
    expect(pi?.baseURI).toBe('http://example.com/dir/e.xml');
    expect(comment?.baseURI).toBe('http://example.com/doc.xml');
    expect(outside?.baseURI).toBe('http://example.com/doc.xml');
  });
});
