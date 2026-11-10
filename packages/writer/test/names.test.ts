import { describe, expect, it } from 'vitest';
import { isKnownNcName, namesElement, qualifiedName } from '@/names';

describe('qualifiedName', () => {
  it('puts a prefix and a colon before the local name, when there is a prefix', () => {
    expect([qualifiedName('', 'a'), qualifiedName('p', 'a')]).toEqual(['a', 'p:a']);
  });
});

describe('isKnownNcName', () => {
  it('accepts XML names without colons, again once remembered, and nothing else', () => {
    expect(['a', 'a', '_b.c-d', 'a:b', '1a', ''].map((name) => isKnownNcName(name))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('namesElement', () => {
  it('finds an element by qualified name or by expanded name as {uri}local', () => {
    const names = new Set(['p:a', '{urn:b}b']);
    expect(namesElement(names, 'p:a', 'urn:a', 'a')).toBe(true);
    expect(namesElement(names, 'q:b', 'urn:b', 'b')).toBe(true);
    expect(namesElement(names, 'b', '', 'b')).toBe(false);
  });
});
