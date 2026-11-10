import { parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { inScopeNamespaces, namespaceForPrefix, TreeBuilder } from '@/index';

const XML = 'http://www.w3.org/XML/1998/namespace';

describe('inScopeNamespaces', () => {
  it('lists xml first, then the innermost binding of each prefix', () => {
    const tree = parse('<a xmlns="urn:a" xmlns:p="urn:p"><b xmlns:p="urn:p2" xmlns:q="urn:q"/></a>').tree;
    expect(inScopeNamespaces(tree, 2)).toEqual([
      { prefix: 'xml', uri: XML },
      { prefix: 'p', uri: 'urn:p2' },
      { prefix: 'q', uri: 'urn:q' },
      { prefix: '', uri: 'urn:a' },
    ]);
    expect(inScopeNamespaces(tree, 1).map((binding) => binding.prefix)).toEqual(['xml', '', 'p']);
  });

  it('leaves out an undeclared default namespace and, in XML 1.1, undeclared prefixes', () => {
    const tree = parse('<?xml version="1.1"?><a xmlns="urn:a" xmlns:p="urn:p"><b xmlns="" xmlns:p=""/></a>').tree;
    expect(inScopeNamespaces(tree, 2)).toEqual([{ prefix: 'xml', uri: XML }]);
  });

  it('stops at a parentless element', () => {
    const builder = new TreeBuilder();
    builder.startElement(builder.names.code('a', ''));
    builder.namespace('p', 'urn:p');
    builder.endElement();
    expect(inScopeNamespaces(builder.finish(), 0).map((binding) => binding.prefix)).toEqual(['xml', 'p']);
  });
});

describe('namespaceForPrefix', () => {
  const tree = parse('<?xml version="1.1"?><a xmlns="urn:a" xmlns:p="urn:p"><b xmlns="" xmlns:p=""><c/></b></a>').tree;

  it('finds the nearest binding of a prefix', () => {
    expect([namespaceForPrefix(tree, 1, ''), namespaceForPrefix(tree, 1, 'p')]).toEqual(['urn:a', 'urn:p']);
    expect(namespaceForPrefix(tree, 1, 'xml')).toBe(XML);
  });

  it('gives the empty string for no default namespace, and undefined for an unbound prefix', () => {
    expect([namespaceForPrefix(tree, 3, ''), namespaceForPrefix(tree, 3, 'p')]).toEqual(['', undefined]);
    expect(namespaceForPrefix(tree, 1, 'q')).toBeUndefined();
    expect(namespaceForPrefix(parse('<a/>').tree, 1, '')).toBe('');
  });
});
