import { describe, expect, it } from 'vitest';
import { namesElement, qualifiedName } from '@/names';

describe('qualifiedName', () => {
  it('puts a prefix and a colon before the local name, when there is a prefix', () => {
    expect([qualifiedName('', 'a'), qualifiedName('p', 'a')]).toEqual(['a', 'p:a']);
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
