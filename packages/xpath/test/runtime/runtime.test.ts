import { describe, expect, it } from 'vitest';
import { errorCode, LIBRARY, parse, strings } from '../helpers/evaluate.ts';

describe('effective boolean value', () => {
  it('takes the truth of one value of each kind', () => {
    expect(
      strings(
        'boolean(1.5), boolean(0.0), boolean(0e0), boolean(xs:double("NaN")), boolean(1e0), boolean(xs:anyURI(""))'
      )
    ).toEqual(['true', 'false', 'false', 'false', 'true', 'false']);
    expect(strings('boolean(xs:untypedAtomic("x")), not(()), not(//book)', LIBRARY)).toEqual(['true', 'true', 'false']);
    expect(errorCode('boolean(xs:QName("a"))')).toBe('FORG0006');
    expect(errorCode('boolean((1, 2))')).toBe('FORG0006');
    expect(errorCode('boolean(abs#1)')).toBe('FORG0006');
    expect(errorCode('boolean(map {})')).toBe('FORG0006');
  });
});

describe('atomization', () => {
  it('atomizes arrays by their members and raises FOTY0013 for other function items', () => {
    expect(strings('data([1, [2, 3], ()]), data(["a"]) = "a"')).toEqual(['1', '2', '3', 'true']);
    expect(errorCode('data(abs#1)')).toBe('FOTY0013');
    expect(errorCode('data(map {})')).toBe('FOTY0013');
    expect(errorCode('[1, 2] + 1')).toBe('XPTY0004');
  });
});

describe('deep equality of nodes', () => {
  const documents = parse('<r><?p a?><?p b?><?q a?><e a="1" b="2">t</e><e b="2" a="1">t</e><e a="1">t</e><f/></r>');

  it('compares documents, elements, attributes, text and the other kinds', () => {
    expect(
      strings(
        'deep-equal(/, /), deep-equal(//e[1], //e[2]), deep-equal(//e[1], //e[3]), deep-equal(//e[1], //f)',
        documents
      )
    ).toEqual(['true', 'true', 'false', 'false']);
    expect(
      strings(
        'deep-equal(//processing-instruction()[1], //processing-instruction()[2]), deep-equal(//e[1]/@a, //e[3]/@a), deep-equal(//e[1]/text(), //e[2]/text())',
        documents
      )
    ).toEqual(['false', 'true', 'true']);
    expect(
      strings('deep-equal(//e[1], //e[1]/@a), deep-equal(/r/namespace::xml, /r/namespace::xml)', documents)
    ).toEqual(['false', 'true']);
  });

  it('numbers processing instructions by target in paths', () => {
    expect(strings('path(//processing-instruction()[3]), path(//processing-instruction()[2])', documents)).toEqual([
      '/Q{}r[1]/processing-instruction(q)[1]',
      '/Q{}r[1]/processing-instruction(p)[2]',
    ]);
  });
});
