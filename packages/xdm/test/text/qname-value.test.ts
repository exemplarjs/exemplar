import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import { DEFAULT_PREFIXES, parseQName } from '@/index';
import { sameQName } from '@/text/qname-value';

describe('parseQName', () => {
  const resolve = (prefix: string): string | undefined => ({ '': 'urn:default', p: 'urn:p' })[prefix];

  it('resolves the prefix, or the default namespace for none', () => {
    expect(parseQName('p:item', resolve)).toEqual(new QName('urn:p', 'item', 'p'));
    expect(parseQName('item', resolve)).toEqual(new QName('urn:default', 'item', ''));
    expect(parseQName('xml:lang', DEFAULT_PREFIXES)?.namespaceURI).toBe('http://www.w3.org/XML/1998/namespace');
  });

  it('refuses text that is not a QName, and raises FONS0004 for an unbound prefix', () => {
    expect(['1a', 'a:b:c', ':a', 'a:'].map((text) => parseQName(text, resolve))).toEqual(
      Array.from({ length: 4 }, () => undefined)
    );
    expect(codeOf(() => parseQName('q:item', resolve))).toBe('FONS0004');
  });

  it('compares QNames by namespace and local name', () => {
    expect(sameQName(new QName('urn:a', 'x', 'p'), new QName('urn:a', 'x', 'q'))).toBe(true);
    expect(sameQName(new QName('urn:a', 'x'), new QName('urn:b', 'x'))).toBe(false);
  });
});
