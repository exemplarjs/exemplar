import { describe, expect, it } from 'vitest';
import { XdmAtomicValue, XS } from '@exemplarjs/xdm';
import { XPathCompiler } from '@/index';
import { errorCode, evaluate, LIBRARY, strings } from '../../helpers/evaluate.ts';

describe('the forms of functions without arguments, on nodes without names', () => {
  it('give empty names and URIs', () => {
    expect(strings('(//text())[1]/local-name(), (//comment())[1]/namespace-uri(), lang(())', LIBRARY)).toEqual([
      '',
      '',
      'false',
    ]);
    expect(strings('generate-id(())', LIBRARY)).toEqual(['']);
    expect(strings('generate-id(/library) = /library/generate-id()', LIBRARY)).toEqual(['true']);
  });
});

describe('argument conversion', () => {
  it('promotes URIs to strings and floats to doubles', () => {
    expect(strings('upper-case(xs:anyURI("a")), math:sqrt(xs:float(4))')).toEqual(['A', '2']);
  });

  it('names the item it was given when it does not match', () => {
    expect(errorCode('in-scope-prefixes((//text())[1])', LIBRARY)).toBe('XPTY0004');
    expect(errorCode('upper-case(1)')).toBe('XPTY0004');
  });

  it('promotes decimals to floats for variables of type xs:float', () => {
    const typed = new XPathCompiler().compile('$f', { variables: { f: 'xs:float', d: 'xs:double?' } });
    expect(
      (typed.evaluate(null, { variables: { f: XdmAtomicValue.integer(1n), d: null } })[0] as XdmAtomicValue).type
    ).toBe(XS.float);
    expect(errorCode('xs:double(1) treat as xs:float')).toBe('XPDY0050');
  });
});

describe('variables of each JavaScript kind', () => {
  it('make values of the declared types', () => {
    const compiler = new XPathCompiler();
    const all = compiler.compile('($f, $b, $i, $n)', {
      variables: { f: 'xs:float', b: 'xs:boolean', i: 'xs:decimal', n: 'xs:numeric' },
    });
    expect(
      all.evaluate(null, { variables: { f: 1.5, b: true, i: 2n, n: 3 } }).map((item) => (item as XdmAtomicValue).type)
    ).toEqual([XS.float, XS.boolean, XS.integer, XS.double]);
  });
});

describe('comparison and equality edges', () => {
  it('compares a typed value with an untyped one on the right', () => {
    expect(strings('12 = //price', LIBRARY)).toEqual(['true']);
    expect(strings('deep-equal(xs:untypedAtomic("a"), "a")')).toEqual(['true']);
  });

  it('rounds to more places than a number has, leaving it as it is', () => {
    expect(evaluate('round(1.5, 2)')).toEqual(['xs:decimal 1.5']);
  });
});

describe('item types', () => {
  it('match kind tests and attribute tests', () => {
    expect(
      strings('//comment() instance of comment(), 1 instance of comment(), //@id instance of attribute()+', LIBRARY)
    ).toEqual(['true', 'false', 'true']);
    expect(
      strings('//@id instance of attribute(*, xs:untypedAtomic)+, //@id instance of attribute(id, xs:string)+', LIBRARY)
    ).toEqual(['true', 'false']);
    expect(
      strings('1 instance of document-node(element(library)), (/) instance of document-node(element(*))', LIBRARY)
    ).toEqual(['false', 'true']);
  });
});
