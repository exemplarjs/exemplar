import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, parse, strings } from '../../helpers/evaluate.ts';

const SCOPED = parse('<r xmlns="urn:d" xmlns:p="urn:p"><c/></r>');

describe('QName functions', () => {
  it('make QNames from a URI and a lexical name', () => {
    expect(evaluate('QName("urn:p", "p:a"), QName((), "a"), QName("urn:d", "a")')).toEqual([
      'xs:QName p:a',
      'xs:QName a',
      'xs:QName a',
    ]);
    expect(errorCode('QName("", "p:a")')).toBe('FOCA0002');
    expect(errorCode('QName("urn:p", "1a")')).toBe('FOCA0002');
    expect(errorCode('QName("urn:p", "a:b:c")')).toBe('FOCA0002');
  });

  it("resolve QNames by an element's namespaces", () => {
    expect(
      strings(
        'namespace-uri-from-QName(resolve-QName(" p:a ", //*:c)), namespace-uri-from-QName(resolve-QName("a", //*:c))',
        SCOPED
      )
    ).toEqual(['urn:p', 'urn:d']);
    expect(evaluate('resolve-QName((), //*:c)', SCOPED)).toEqual([]);
    expect(errorCode('resolve-QName("q:a", //*:c)', SCOPED)).toBe('FONS0004');
    expect(strings('namespace-uri-from-QName(resolve-QName("a", /e))', parse('<e/>'))).toEqual(['']);
  });

  it('take QNames apart', () => {
    expect(
      evaluate(
        'prefix-from-QName(QName("urn:p", "p:a")), prefix-from-QName(QName("", "a")), local-name-from-QName(QName("urn:p", "p:a")), namespace-uri-from-QName(QName("urn:p", "p:a")), local-name-from-QName(())'
      )
    ).toEqual(['xs:NCName p', 'xs:NCName a', 'xs:anyURI urn:p']);
  });

  it("give an element's prefixes and their namespaces", () => {
    expect(strings('in-scope-prefixes(//*:c)', SCOPED)).toEqual(['xml', '', 'p']);
    expect(
      strings(
        'namespace-uri-for-prefix("p", //*:c), namespace-uri-for-prefix((), //*:c), namespace-uri-for-prefix("q", //*:c)',
        SCOPED
      )
    ).toEqual(['urn:p', 'urn:d']);
    expect(strings('namespace-uri-for-prefix("", /e)', parse('<e/>'))).toEqual([]);
  });
});
