import { describe, expect, it } from 'vitest';
import { XdmDocumentBuilder, type XdmNode } from '@exemplarjs/xdm';
import { XMLInputFactory } from '@exemplarjs/xml';
import { type EvaluationOptions, XPathCompiler, XPathException } from '@/index';
import { parse } from '../../helpers/evaluate.ts';
import { readingWith, resolverOf } from '../../helpers/resources.ts';

const BASE = 'http://example.org/data/';
const compiler = new XPathCompiler({ baseURI: BASE });

/** Evaluates an expression with options, giving each item's string value. */
function strings(expression: string, options: EvaluationOptions = {}): string[] {
  return compiler.compile(expression).evaluateStrings(null, options);
}

/** The code of the error an expression raises with options. */
function errorCode(expression: string, options: EvaluationOptions = {}): string | undefined {
  try {
    compiler.compile(expression).evaluate(null, options);
    return undefined;
  } catch (error) {
    if (error instanceof XPathException) return error.code;
    throw error;
  }
}

const books = resolverOf({
  [`${BASE}books.xml`]: '<books><book>Dune</book><book>Emma</book></books>',
  [`${BASE}moved.xml`]: { text: '<moved/>', systemId: 'http://example.org/elsewhere/moved.xml' },
  [`${BASE}broken.xml`]: '<books>',
});

describe('doc', () => {
  it('reads a document through the URI resolver, its URI made absolute against the static base URI', () => {
    expect(strings('doc("books.xml")//book', readingWith(books))).toEqual(['Dune', 'Emma']);
    expect(strings(`doc("${BASE}books.xml")/books/book[2]`, readingWith(books))).toEqual(['Emma']);
  });

  it('reads a document once in an evaluation, so that every call gives the same document', () => {
    const resolver = resolverOf({ [`${BASE}books.xml`]: '<books/>' });
    expect(strings('doc("books.xml") is doc("./books.xml")', readingWith(resolver))).toEqual(['true']);
    expect(resolver.asked).toEqual([`${BASE}books.xml`]);
  });

  it('gives the document the URI asked for, and the base URI it was read from', () => {
    expect(strings('document-uri(doc("moved.xml")), base-uri(doc("moved.xml"))', readingWith(books))).toEqual([
      `${BASE}moved.xml`,
      'http://example.org/elsewhere/moved.xml',
    ]);
  });

  it('gives a preloaded document without asking the resolver', () => {
    const preloaded = parse('<preloaded/>');
    const documents = new Map<string, XdmNode>([[`${BASE}p.xml`, preloaded]]);
    expect(strings('name(doc("p.xml")/*)', { resources: { documents } })).toEqual(['preloaded']);
  });

  it('reads documents with the builder the resources name, and its factory settings', () => {
    const builder = new XdmDocumentBuilder(new XMLInputFactory({ disallowDoctype: true }));
    const resolver = resolverOf({ [`${BASE}dtd.xml`]: '<!DOCTYPE a><a/>' });
    expect(errorCode('doc("dtd.xml")', { resources: { uriResolver: resolver, builder } })).toBe('FODC0002');
    expect(strings('name(doc("dtd.xml")/*)', readingWith(resolver))).toEqual(['a']);
  });

  it('gives the empty sequence for the empty sequence', () => {
    expect(strings('count(doc(()))')).toEqual(['0']);
  });

  it('raises FODC0005 for a URI that is not valid', () => {
    expect(errorCode('doc("%zz")', readingWith(books))).toBe('FODC0005');
    expect(errorCodeWithoutBase('doc("%zz")')).toBe('FODC0005');
  });

  it('raises FODC0002 for a relative URI with no static base URI to resolve it against', () => {
    expect(errorCodeWithoutBase('doc("relative.xml")')).toBe('FODC0002');
    expect(errorCodeWithoutBase('collection("relative")')).toBe('FODC0002');
  });

  it('raises FODC0002 for a document no resolver supplies, one not well-formed, or one the resolver fails on', () => {
    expect(errorCode('doc("books.xml")')).toBe('FODC0002');
    expect(errorCode('doc("missing.xml")', readingWith(books))).toBe('FODC0002');
    expect(errorCode('doc("broken.xml")', readingWith(books))).toBe('FODC0002');
    const failing = {
      resolve: () => {
        throw new Error('refused');
      },
    };
    expect(errorCode('doc("books.xml")', readingWith(failing))).toBe('FODC0002');
    const throwingText = {
      resolve: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- a resolver may throw anything
        throw 'refused';
      },
    };
    expect(errorCode('doc("books.xml")', readingWith(throwingText))).toBe('FODC0002');
  });

  it('raises a TypeError for a resolver that answers with a promise, which only the asynchronous methods wait for', () => {
    const promised = resolverOf({ [`${BASE}books.xml`]: '<books/>' }, true);
    expect(() => compiler.compile('doc("books.xml")').evaluate(null, readingWith(promised))).toThrow(TypeError);
  });
});

/** The code of the error an expression raises when compiled with no static base URI. */
function errorCodeWithoutBase(expression: string): string | undefined {
  try {
    new XPathCompiler().compile(expression).evaluate(null, readingWith(books));
    return undefined;
  } catch (error) {
    return (error as XPathException).code;
  }
}

describe('doc-available', () => {
  it('tells whether doc would give a document', () => {
    expect(strings('doc-available("books.xml"), doc-available("missing.xml")', readingWith(books))).toEqual([
      'true',
      'false',
    ]);
    expect(strings('doc-available("broken.xml"), doc-available("%zz"), doc-available(())', readingWith(books))).toEqual(
      ['false', 'false', 'false']
    );
  });

  it('agrees with doc for the rest of the evaluation', () => {
    expect(strings('doc-available("books.xml") and exists(doc("books.xml"))', readingWith(books))).toEqual(['true']);
  });

  it('passes on the TypeError for a promise rather than answering false', () => {
    const promised = resolverOf({ [`${BASE}books.xml`]: '<books/>' }, true);
    expect(() => compiler.compile('doc-available("books.xml")').evaluate(null, readingWith(promised))).toThrow(
      TypeError
    );
  });
});

describe('parse-xml', () => {
  it('parses a string as a document, whose base URI is the static base URI and which has no document URI', () => {
    expect(strings('parse-xml("<a><b>x</b></a>")/a/b')).toEqual(['x']);
    expect(strings('base-uri(parse-xml("<a/>")), empty(document-uri(parse-xml("<a/>")))')).toEqual([BASE, 'true']);
    expect(new XPathCompiler().compile('base-uri(parse-xml("<a/>"))').evaluateStrings()).toEqual([]);
  });

  it('gives the empty sequence for the empty sequence, and raises FODC0006 for a string that is not well-formed', () => {
    expect(strings('count(parse-xml(()))')).toEqual(['0']);
    expect(errorCode('parse-xml("<a>")')).toBe('FODC0006');
    expect(errorCode('parse-xml("text")')).toBe('FODC0006');
  });
});

describe('parse-xml-fragment', () => {
  it('parses a string as the content of an element, into a document of its nodes', () => {
    expect(strings('count(parse-xml-fragment("one<a/>two<b/>")/node())')).toEqual(['4']);
    expect(strings('string(parse-xml-fragment("one<a>two</a>"))')).toEqual(['onetwo']);
    expect(strings('count(parse-xml-fragment("")/node()), base-uri(parse-xml-fragment("x"))')).toEqual(['0', BASE]);
  });

  it('leaves out a text declaration, but not a processing instruction whose name begins with xml', () => {
    expect(strings(`parse-xml-fragment('<?xml encoding="utf-8"?><a/>')/*/name()`)).toEqual(['a']);
    expect(strings(`parse-xml-fragment("<?xml version='1.0' encoding='utf-8' ?>x")`)).toEqual(['x']);
    expect(strings(`parse-xml-fragment('<?xml-stylesheet href="s"?><a/>')/processing-instruction()/name()`)).toEqual([
      'xml-stylesheet',
    ]);
  });

  it('raises FODC0006 for a declaration that is not a text declaration, or content that is not well-formed', () => {
    expect(errorCode(`parse-xml-fragment('<?xml version="1.0"?><a/>')`)).toBe('FODC0006');
    expect(errorCode(`parse-xml-fragment('<?xml encoding="utf-8" standalone="yes"?><a/>')`)).toBe('FODC0006');
    expect(errorCode(`parse-xml-fragment('<a>')`)).toBe('FODC0006');
    expect(errorCode(`parse-xml-fragment('<!DOCTYPE a><a/>')`)).toBe('FODC0006');
    expect(strings('count(parse-xml-fragment(()))')).toEqual(['0']);
  });
});

describe('parse-xml reading a DTD through a resolver that answers with a promise', () => {
  it('waits for the DTD in evaluateAsync, and raises a TypeError in evaluate', async () => {
    const entityResolver = { resolveEntity: () => Promise.resolve({ text: '<!ENTITY e "from the DTD">' }) };
    const builder = new XdmDocumentBuilder(new XMLInputFactory({ entityResolver, accessExternalDTD: ['all'] }));
    const text = new XPathCompiler({ baseURI: 'http://example.com/' }).compile(
      `string(parse-xml('<!DOCTYPE a SYSTEM "a.dtd"><a>&e;</a>'))`
    );
    expect(await text.evaluateStringAsync(null, { resources: { builder } })).toBe('from the DTD');
    expect(() => text.evaluateString(null, { resources: { builder } })).toThrow(TypeError);
  });
});
