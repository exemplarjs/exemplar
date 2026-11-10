import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, evaluate, LIBRARY, strings } from '../helpers/evaluate.ts';

describe('instance of and treat as', () => {
  it('test values against sequence types', () => {
    expect(
      strings(
        '1 instance of xs:integer, 1 instance of xs:decimal, 1 instance of xs:string, () instance of empty-sequence()'
      )
    ).toEqual(['true', 'true', 'false', 'true']);
    expect(
      strings('(1, 2) instance of xs:integer+, () instance of xs:integer?, (1, 2) instance of xs:integer?')
    ).toEqual(['true', 'true', 'false']);
    expect(strings('//book instance of element(book)*, //book instance of node()+', LIBRARY)).toEqual(['true', 'true']);
    expect(strings('1 instance of xs:numeric, "1" instance of item(), 1 instance of xs:error')).toEqual([
      'true',
      'true',
      'false',
    ]);
    expect(strings('1 instance of function(*), 1 instance of map(*), 1 instance of array(*)')).toEqual([
      'false',
      'false',
      'false',
    ]);
  });

  it('give the value of treat as when it matches, and raise XPDY0050 when it does not', () => {
    expect(strings('(1, 2) treat as xs:integer+')).toEqual(['1', '2']);
    expect(errorCode('"a" treat as xs:integer')).toBe('XPDY0050');
  });
});

describe('cast as and castable as', () => {
  it('cast one atomized value, or allow the empty sequence with ?', () => {
    expect(evaluate('"12" cast as xs:integer, (//price)[1] cast as xs:decimal', LIBRARY)).toEqual([
      'xs:integer 12',
      'xs:decimal 12',
    ]);
    expect(evaluate('() cast as xs:integer?')).toEqual([]);
    expect(errorCode('() cast as xs:integer')).toBe('XPTY0004');
    expect(errorCode('(1, 2) cast as xs:integer')).toBe('XPTY0004');
    expect(errorCode('"a" cast as xs:integer')).toBe('FORG0001');
  });

  it('cast to xs:numeric, keeping numbers as they are and making other values doubles', () => {
    expect(evaluate('xs:short(2) cast as xs:numeric, "2" cast as xs:numeric')).toEqual(['xs:short 2', 'xs:double 2']);
  });

  it('cast to the list types, token by token', () => {
    expect(evaluate('"a  b" cast as xs:NMTOKENS')).toEqual(['xs:NMTOKEN a', 'xs:NMTOKEN b']);
    expect(evaluate('xs:IDREFS("x y")')).toEqual(['xs:IDREF x', 'xs:IDREF y']);
    expect(evaluate('xs:ENTITIES("e")')).toEqual(['xs:ENTITY e']);
    expect(errorCode('" " cast as xs:NMTOKENS')).toBe('FORG0001');
  });

  it('cast nothing to xs:error', () => {
    expect(errorCode('1 cast as xs:error')).toBe('FORG0001');
    expect(evaluate('() cast as xs:error?')).toEqual([]);
    expect(strings('1 castable as xs:error')).toEqual(['false']);
  });

  it('resolve prefixes of QNames with the static namespaces and the default element namespace', () => {
    expect(evaluate('namespace-uri-from-QName("p:a" cast as xs:QName)', null, { namespaces: { p: 'urn:p' } })).toEqual([
      'xs:anyURI urn:p',
    ]);
    expect(evaluate('namespace-uri-from-QName(xs:QName("a"))', null, { defaultElementNamespace: 'urn:d' })).toEqual([
      'xs:anyURI urn:d',
    ]);
  });

  it('say whether a cast succeeds, raising the errors of the operand itself', () => {
    expect(strings('"12" castable as xs:integer, "a" castable as xs:integer, () castable as xs:integer')).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(strings('(1, 2) castable as xs:integer')).toEqual(['false']);
    expect(errorCode('error() castable as xs:integer')).toBe('FOER0000');
  });

  it('raise XPST0080 for an abstract target and XPST0051 for an unknown one', () => {
    expect(errorCode('1 cast as xs:anyAtomicType')).toBe('XPST0080');
    expect(errorCode('1 cast as xs:NOTATION')).toBe('XPST0080');
    expect(errorCode('1 castable as xs:anySimpleType')).toBe('XPST0080');
    expect(errorCode('1 cast as xs:nonsense')).toBe('XPST0051');
    expect(errorCode('1 cast as p:t', null, { namespaces: { p: 'urn:p' } })).toBe('XPST0051');
  });
});

describe('constructor functions', () => {
  it('cast their argument, allowing the empty sequence', () => {
    expect(evaluate('xs:integer("5"), xs:numeric("5"), xs:boolean(1)')).toEqual([
      'xs:integer 5',
      'xs:double 5',
      'xs:boolean true',
    ]);
    expect(evaluate('xs:integer(())')).toEqual([]);
  });

  it('do not exist for abstract types or names that are not types', () => {
    expect(errorCode('xs:anyAtomicType(1)')).toBe('XPST0017');
    expect(errorCode('xs:NOTATION(1)')).toBe('XPST0017');
    expect(errorCode('xs:nonsense(1)')).toBe('XPST0017');
    expect(errorCode('xs:integer(1, 2)')).toBe('XPST0017');
  });

  it('cast a literal once, raising a failed cast only when evaluated', () => {
    const failing = new XPathCompiler().compile('xs:integer("x")');
    expect(() => failing.evaluate()).toThrow(/FORG0001/);
    expect(strings('if (false()) then ("x" cast as xs:integer, xs:date("x")) else "kept"')).toEqual(['kept']);
    expect(strings('for $i in 1 to 2 return xs:date("2020-01-31") + $i * xs:dayTimeDuration("P1D")')).toEqual([
      '2020-02-01',
      '2020-02-02',
    ]);
    expect(evaluate('"7" cast as xs:integer')).toEqual(['xs:integer 7']);
  });
});

describe('casts to list types', () => {
  it('take only strings and untyped values', () => {
    expect(errorCode('xs:NMTOKENS(1)')).toBe('XPTY0004');
    expect(errorCode('1 cast as xs:NMTOKENS')).toBe('XPTY0004');
    expect(strings('1 castable as xs:NMTOKENS, xs:untypedAtomic("a b") castable as xs:NMTOKENS')).toEqual([
      'false',
      'true',
    ]);
  });
});

describe('sequence types in messages and type tests', () => {
  it('name types in messages as written, prefixes and type names too', () => {
    const message = (expression: string): string | undefined => {
      try {
        new XPathCompiler({ namespaces: { dc: 'urn:dc' } }).compile(expression).evaluate(LIBRARY);
      } catch (error) {
        return (error as Error).message;
      }
      return undefined;
    };
    expect(message('//book treat as element(*, xs:integer)+')).toBe(
      'XPDY0050: The value is not an instance of element(*, xs:integer)+'
    );
    expect(message('//book treat as element(dc:title)+')).toBe(
      'XPDY0050: The value is not an instance of element(dc:title)+'
    );
    expect(message('1 treat as map(xs:string, item()*)')).toBe(
      'XPDY0050: The value is not an instance of map(xs:string, item()*)'
    );
    expect(message('1 treat as (function(xs:string) as item())?')).toBe(
      'XPDY0050: The value is not an instance of (function(xs:string) as item())?'
    );
  });

  it('know the list and union types in element and attribute tests, which untyped nodes are not', () => {
    expect(
      strings('//@id instance of attribute(*, xs:NMTOKENS)+, //book instance of element(*, xs:numeric)+', LIBRARY)
    ).toEqual(['false', 'false']);
  });
});
