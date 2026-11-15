import { describe, expect, it } from 'vitest';
import { elementRoot, errorCode, evaluate, LIBRARY, parse, strings } from '../../helpers/evaluate.ts';

const IDS = parse(
  '<!DOCTYPE r [<!ATTLIST e id ID #IMPLIED ref IDREF #IMPLIED refs IDREFS #IMPLIED>]>' +
    '<r><e id="a" ref="b"/><e id="b" refs="a b"/><e ref="a"/></r>'
);

describe('accessors', () => {
  it('give node names, nilled, data and URIs', () => {
    expect(evaluate('node-name(//book[1]), node-name(/), nilled(//book[1]), nilled((//@id)[1])', LIBRARY)).toEqual([
      'xs:QName book',
      'xs:boolean false',
    ]);
    expect(evaluate('node-name(()), //book[1]/node-name()', LIBRARY)).toEqual(['xs:QName book']);
    expect(evaluate('data((//price)[1]), data((1, "a"))', LIBRARY)).toEqual([
      'xs:untypedAtomic 12',
      'xs:integer 1',
      'xs:string a',
    ]);
    expect(evaluate('(//price)[1]/data()', LIBRARY)).toEqual(['xs:untypedAtomic 12']);
    expect(evaluate('data(//comment()), data(/library/namespace::dc)', LIBRARY)).toEqual([
      'xs:string  note ',
      'xs:string urn:dc',
    ]);
    expect(evaluate('base-uri(/), document-uri(/), document-uri(//book[1])', LIBRARY)).toEqual([
      'xs:anyURI http://example.com/doc.xml',
      'xs:anyURI http://example.com/doc.xml',
    ]);
    expect(errorCode('base-uri(1)')).toBe('XPTY0004');
  });

  it('take the context node for the forms without an argument', () => {
    expect(errorCode('name()')).toBe('XPDY0002');
    expect(errorCode('1!name()')).toBe('XPTY0004');
  });
});

describe('node functions', () => {
  it('give names, local names and namespace URIs', () => {
    expect(
      strings('name((//dc:title)[1]), local-name((//dc:title)[1]), namespace-uri((//dc:title)[1]), name(())', LIBRARY, {
        namespaces: { dc: 'urn:dc' },
      })
    ).toEqual(['dc:title', 'title', 'urn:dc', '']);
    expect(
      strings(
        '(//dc:title)[1]/name(), (//dc:title)[1]/local-name(), (//dc:title)[1]/namespace-uri(), namespace-uri(())',
        LIBRARY,
        { namespaces: { dc: 'urn:dc' } }
      )
    ).toEqual(['dc:title', 'title', 'urn:dc', '']);
    expect(strings('name(/)', LIBRARY)).toEqual(['']);
  });

  it('give the root and whether a node has children', () => {
    expect(evaluate('root(//book[1]), //book[1]/root(), root(())', LIBRARY)).toEqual(['document', 'document']);
    expect(
      strings('has-children(//book[1]), has-children((//@id)[1]), //book[1]/has-children(), has-children(())', LIBRARY)
    ).toEqual(['true', 'false', 'true', 'false']);
  });

  it('test the language from the nearest xml:lang', () => {
    const document = parse('<r xml:lang="en-GB"><c/><d xml:lang="fr"/></r>');
    expect(
      strings(
        'lang("en", //c), lang("EN", //c), lang("en-GB", //c), lang("en", //d), lang("en", /r/..), lang((), //c)',
        document
      )
    ).toEqual(['true', 'true', 'true', 'false', 'false', 'false']);
    expect(strings('//c/lang("en")', document)).toEqual(['true']);
  });

  it('give the paths of nodes of every kind', () => {
    expect(
      strings(
        'path(/), path((//price)[2]), path((//@id)[1]), path((//text())[last()]), path(//comment()), path(//processing-instruction())',
        LIBRARY
      )
    ).toEqual([
      '/',
      '/Q{}library[1]/Q{}book[2]/Q{}price[1]',
      '/Q{}library[1]/Q{}book[1]/@id',
      '/Q{}library[1]/text()[1]',
      '/Q{}library[1]/Q{}book[2]/comment()[1]',
      '/Q{}library[1]/Q{}book[2]/processing-instruction(pi)[1]',
    ]);
    expect(
      strings(
        'path(//namespace::dc), path(/*/namespace::*[name() = ""])',
        parse('<r xmlns="urn:d" xmlns:dc="urn:dc"/>')
      )
    ).toEqual([
      '/Q{urn:d}r[1]/namespace::dc',
      '/Q{urn:d}r[1]/namespace::*[Q{http://www.w3.org/2005/xpath-functions}local-name()=""]',
    ]);
    expect(strings('path(//@Q{urn:p}a)', parse('<r xmlns:p="urn:p" p:a="1"/>'))).toEqual(['/Q{}r[1]/@Q{urn:p}a']);
    expect(strings('path(.), path(())', elementRoot())).toEqual(['Q{http://www.w3.org/2005/xpath-functions}root()']);
    expect(strings('path(.)', LIBRARY)).toEqual(['/']);
  });

  it('keep the innermost or outermost of nodes', () => {
    expect(strings('innermost(//*)/name()', LIBRARY)).toEqual(['dc:title', 'price', 'dc:title', 'price']);
    expect(strings('outermost(//book | //price)/@id', LIBRARY)).toEqual(['b1', 'b2']);
  });

  it('treat attributes and namespaces as inside their element, at any depth', () => {
    const tree = parse('<r xmlns:p="urn:p"><a x="1"><b/></a><c y="2"/><d><e><f z="3"/></e></d><g/></r>');
    const names = 'for $n in . return if ($n instance of attribute()) then "@" || name($n) else name($n)';
    expect(strings(`innermost(//* | //@*) ! (${names})`, tree)).toEqual(['@x', 'b', '@y', '@z', 'g']);
    expect(strings(`outermost(//b | //@* | //e | //f) ! (${names})`, tree)).toEqual(['@x', 'b', '@y', 'e']);
    expect(strings('innermost(//c | //c/namespace::*) ! local-name()', tree)).toEqual(['xml', 'p']);
    expect(strings('outermost(//namespace::* | //d) ! local-name()', tree)).toHaveLength(11);
  });

  it('generate identifiers unique to each node', () => {
    const ids = strings(
      '//book ! generate-id(), /library/namespace::* ! generate-id(), generate-id(()), //book[1]/generate-id()',
      LIBRARY
    );
    expect(ids).toHaveLength(6);
    expect(new Set(ids.slice(0, 4)).size).toBe(4);
    expect(ids.slice(0, 4).every((id) => /^[A-Za-z][A-Za-z0-9]*$/.test(id))).toBe(true);
    expect(ids[4]).toBe('');
    expect(ids[5]).toBe(ids[0]);
  });

  it('find elements by ID and attributes by IDREF', () => {
    expect(strings('id("b a")/@id, element-with-id("a")/@id, id("x")', IDS)).toEqual(['a', 'b', 'a']);
    expect(strings('//e[3]/id("b")/@id', IDS)).toEqual(['b']);
    expect(strings('idref("a")/..! count(preceding-sibling::*)', IDS)).toEqual(['1', '2']);
    expect(strings('id("a", //e[2])/@id', IDS)).toEqual(['a']);
    expect(errorCode('id("a", .)', elementRoot())).toBe('FODC0001');
    expect(errorCode('id("a")')).toBe('XPDY0002');
  });
});
