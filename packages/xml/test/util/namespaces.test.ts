import { reader } from '@test/helpers/parse';
import { describe, expect, it } from 'vitest';
import {
  declarationName,
  declaredPrefixOf,
  declaredPrefixes,
  namespacesInScope,
  reservedBindingProblem,
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
} from '@/util/namespaces';

describe('the reserved namespaces (Namespaces §3)', () => {
  it('names the namespaces of the xml and xmlns prefixes', () => {
    expect([XML_NAMESPACE, XMLNS_NAMESPACE]).toEqual([
      'http://www.w3.org/XML/1998/namespace',
      'http://www.w3.org/2000/xmlns/',
    ]);
  });

  it.each([
    ['p', 'http://example.com/', undefined],
    ['', '', undefined],
    ['xml', XML_NAMESPACE, undefined],
    ['xmlns', 'http://example.com/', 'The xmlns prefix and namespace only declare other prefixes'],
    ['p', XMLNS_NAMESPACE, 'The xmlns prefix and namespace only declare other prefixes'],
    ['xml', 'http://example.com/', 'The xml prefix cannot be bound to http://example.com/'],
    ['p', XML_NAMESPACE, `${XML_NAMESPACE} needs the xml prefix`],
    ['', XML_NAMESPACE, `${XML_NAMESPACE} needs the xml prefix`],
  ])('binding %j to %j breaks: %s', (prefix, uri, problem) => {
    expect(reservedBindingProblem(prefix, uri)).toBe(problem);
  });
});

describe('namespace scopes', () => {
  const parent: ReadonlyMap<string, string> = new Map([['', 'urn:d']]);

  it("adds a start tag's declarations to its parent's scope, keeping the parent's map when it has none", () => {
    const r = reader('<a xmlns="urn:a" xmlns:p="urn:p"><b/></a>');
    r.nextTag();
    expect(declaredPrefixes(r)).toEqual(['', 'p']);
    const scope = namespacesInScope(parent, r);
    expect([...scope]).toEqual([
      ['', 'urn:a'],
      ['p', 'urn:p'],
    ]);
    expect([...parent]).toEqual([['', 'urn:d']]);
    r.nextTag();
    expect(declaredPrefixes(r)).toEqual([]);
    expect(namespacesInScope(scope, r)).toBe(scope);
  });
});

describe('declaredPrefixOf', () => {
  it('gives the prefix a declaration declares, and undefined for any other attribute', () => {
    expect([declaredPrefixOf('xmlns'), declaredPrefixOf('xmlns:p'), declaredPrefixOf('p:a')]).toEqual([
      '',
      'p',
      undefined,
    ]);
  });
});

describe('declarationName', () => {
  it('names the attribute that declares a prefix, or the default namespace', () => {
    expect(declarationName('')).toBe('xmlns');
    expect(declarationName('p')).toBe('xmlns:p');
  });
});
