import { describe, expect, it } from 'vitest';
import { XdmAtomicValue } from '@exemplarjs/xdm';
import { collectionMap, XPathCompiler } from '@/index';

describe('collectionMap', () => {
  const item = XdmAtomicValue.string('item');
  const resolver = collectionMap({ 'urn:a': ['http://example.org/a.xml', item], 'urn:b': [] }, 'urn:b');

  it('gives the members of each collection it holds, and none for others', () => {
    expect(resolver.resolveCollection('urn:a')).toEqual(['http://example.org/a.xml', item]);
    expect(resolver.resolveCollection('urn:other')).toBeUndefined();
  });

  it('gives the collection the default URI names as the default collection, or none without one', () => {
    expect(resolver.resolveCollection(undefined)).toEqual([]);
    expect(collectionMap({}).resolveCollection(undefined)).toBeUndefined();
  });

  it('serves fn:collection', () => {
    const options = { resources: { collectionResolver: collectionMap({ 'urn:items': [item] }) } };
    expect(new XPathCompiler().compile('collection("urn:items")').evaluateStrings(null, options)).toEqual(['item']);
  });
});
