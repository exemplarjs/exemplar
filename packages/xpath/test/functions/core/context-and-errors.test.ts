import { describe, expect, it } from 'vitest';
import { XPathCompiler, XPathException } from '@/index';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';

describe('context functions', () => {
  it('give the focus, needing a context item', () => {
    expect(strings('("a", "b", "c")[position() = 2], ("a", "b")[last()]')).toEqual(['b', 'b']);
    expect(errorCode('position()')).toBe('XPDY0002');
    expect(errorCode('last()')).toBe('XPDY0002');
  });

  it('give the static base URI, the default collation and the default language', () => {
    expect(evaluate('static-base-uri()', null, { baseURI: 'http://e.com/' })).toEqual(['xs:anyURI http://e.com/']);
    expect(evaluate('static-base-uri()')).toEqual([]);
    expect(evaluate('default-collation(), default-language()')).toEqual([
      'xs:string http://www.w3.org/2005/xpath-functions/collation/codepoint',
      'xs:language en',
    ]);
  });

  it('expose no environment variables', () => {
    expect(evaluate('environment-variable("PATH"), available-environment-variables()')).toEqual([]);
  });
});

describe('fn:error and fn:trace', () => {
  /** The XPathException an expression raises. */
  function raised(expression: string): XPathException {
    try {
      new XPathCompiler().compile(expression).evaluate();
    } catch (error) {
      return error as XPathException;
    }
    throw new Error(`${expression} raised nothing`);
  }

  it('raise errors with a code, a description and a value', () => {
    expect(raised('error()')).toMatchObject({
      code: 'FOER0000',
      message: 'FOER0000: An error was raised by fn:error()',
    });
    expect(raised('error(xs:QName("err:XPTY0004"))').code).toBe('XPTY0004');
    expect(raised('error(QName("urn:mine", "m:oops"), "Oops")')).toMatchObject({
      code: 'Q{urn:mine}oops',
      message: 'Q{urn:mine}oops: Oops',
    });
    expect(raised('error((), "Oops", (1, 2))').value).toHaveLength(2);
  });

  it('give back the value it traces', () => {
    expect(strings('trace((1, 2)), trace(3, "label")')).toEqual(['1', '2', '3']);
  });
});

describe('fn:resolve-uri', () => {
  it('resolves relative references against a base, or the static base URI', () => {
    expect(
      strings(
        'resolve-uri("b/c.xml", "http://e.com/a/d.xml"), resolve-uri("../x", "http://e.com/a/b/"), resolve-uri("http://f.com/", "http://e.com/")'
      )
    ).toEqual(['http://e.com/a/b/c.xml', 'http://e.com/a/x', 'http://f.com/']);
    expect(strings('resolve-uri("x.xml")', null, { baseURI: 'http://e.com/a/' })).toEqual(['http://e.com/a/x.xml']);
    expect(evaluate('resolve-uri(())')).toEqual([]);
    expect(evaluate('resolve-uri((), "http://e.com/")')).toEqual([]);
  });

  it('keeps characters outside ASCII and spaces as they are', () => {
    expect(strings('resolve-uri("ç d.html", "http://e.com/à.html")')).toEqual(['http://e.com/ç d.html']);
  });

  it('raises FORG0002 for what is not a URI and FONS0005 for no base', () => {
    expect(errorCode('resolve-uri(":", "http://e.com/")')).toBe('FORG0002');
    expect(errorCode('resolve-uri("a", "http://e.com/a#f")')).toBe('FORG0002');
    expect(errorCode('resolve-uri("a", "relative")')).toBe('FORG0002');
    expect(errorCode('resolve-uri("a")')).toBe('FONS0005');
  });
});

describe('fn:resolve-uri against rootless bases', () => {
  it('removes dot segments as RFC 3986 §5.2.4 does', () => {
    expect(
      strings('resolve-uri("../x", "foo:a/b"), resolve-uri("a/../b", "foo:"), resolve-uri("./c", "foo:a/b")')
    ).toEqual(['foo:/x', 'foo:/b', 'foo:a/c']);
  });
});
