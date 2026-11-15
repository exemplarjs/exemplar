import { describe, expect, it } from 'vitest';
import { XdmAtomicValue, XdmDocumentBuilder } from '@exemplarjs/xdm';
import { type CollectionResolver, type EvaluationOptions, XPathCompiler, XPathException } from '@/index';
import { parse } from '../../helpers/evaluate.ts';
import { resolverOf } from '../../helpers/resources.ts';

const BASE = 'http://example.org/c/';
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

const given = parse('<given/>', 'http://example.org/given.xml');
const collections: CollectionResolver = {
  resolveCollection: (uri) => {
    if (uri === undefined) return ['books/a.xml'];
    if (uri === `${BASE}books`)
      return ['books/a.xml', 'http://example.org/c/books/b.xml', given, XdmAtomicValue.string('x')];
    if (uri === `${BASE}failing`) throw new Error('refused');
    return undefined;
  },
};
const resources: EvaluationOptions = {
  resources: {
    collectionResolver: collections,
    uriResolver: resolverOf({ [`${BASE}books/a.xml`]: '<a/>', [`${BASE}books/b.xml`]: '<b/>' }),
  },
};

describe('collection', () => {
  it('gives a collection by URI: its URI members read as doc reads them, against the collection URI, and its items as they are', () => {
    expect(strings('collection("books") ! (if (. instance of node()) then name(*) else string())', resources)).toEqual([
      'a',
      'b',
      'given',
      'x',
    ]);
  });

  it('gives the default collection without a URI, or for the empty sequence', () => {
    expect(strings('collection()/name(*), collection(())/name(*)', resources)).toEqual(['a', 'a']);
  });

  it('reads a member once, so that the collection and doc give the same document', () => {
    expect(strings('collection()[1] is doc("books/a.xml")', resources)).toEqual(['true']);
  });

  it('raises FODC0002 for a collection no resolver knows or one it fails on, and FODC0004 for a URI that is not valid', () => {
    expect(errorCode('collection("unknown")', resources)).toBe('FODC0002');
    expect(errorCode('collection("failing")', resources)).toBe('FODC0002');
    expect(errorCode('collection()')).toBe('FODC0002');
    expect(errorCode('collection("%zz")', resources)).toBe('FODC0004');
  });
});

describe('uri-collection', () => {
  it("gives a collection's URIs: its URI members, and the document URIs of its documents", () => {
    expect(strings('uri-collection("books")', resources)).toEqual([
      `${BASE}books/a.xml`,
      `${BASE}books/b.xml`,
      'http://example.org/given.xml',
    ]);
    expect(strings('uri-collection(), uri-collection(())', resources)).toEqual([
      `${BASE}books/a.xml`,
      `${BASE}books/a.xml`,
    ]);
    expect(strings('uri-collection("books")[1] instance of xs:anyURI', resources)).toEqual(['true']);
  });

  it('raises FODC0002 for a collection no resolver knows', () => {
    expect(errorCode('uri-collection("unknown")', resources)).toBe('FODC0002');
  });

  it('leaves out items without a document URI, and keeps a URI no base makes absolute as it is', () => {
    const unnamed = new XdmDocumentBuilder().parse('<unnamed/>');
    const resolveCollection = () => [unnamed, 'relative.xml'];
    const options = { resources: { collectionResolver: { resolveCollection } } };
    expect(new XPathCompiler().compile('uri-collection()').evaluateStrings(null, options)).toEqual(['relative.xml']);
  });
});

describe('collection with resolvers that answer with promises', () => {
  it('asks for every member document together, and gives them in order', async () => {
    const uriResolver = resolverOf({ 'u:1.xml': '<x>1</x>', 'u:2.xml': '<x>2</x>' }, true);
    const collectionResolver = { resolveCollection: () => Promise.resolve(['u:1.xml', 'u:2.xml']) };
    const items = new XPathCompiler().compile('collection("u:c")/x/string()');
    const options = { resources: { uriResolver, collectionResolver } };
    expect(await items.evaluateStringsAsync(null, options)).toEqual(['1', '2']);
    expect(uriResolver.asked).toEqual(['u:1.xml', 'u:2.xml']);
  });
});
