import { describe, expect, it } from 'vitest';
import { NameTable, NO_NAME, SEVERAL_CODES } from '@/index';

describe('NameTable', () => {
  it('gives a name the same code each time', () => {
    const names = new NameTable();
    const code = names.code('item', '');
    expect(names.code('item', '')).toBe(code);
    expect(names.code('other', '')).not.toBe(code);
    expect(names.size).toBe(2);
  });

  it('keeps the prefix, namespace and local name', () => {
    const names = new NameTable();
    const name = names.qName(names.code('x:item', 'urn:x'));
    expect([name.prefix, name.namespaceURI, name.localName]).toEqual(['x', 'urn:x', 'item']);
    expect(names.qName(names.code('plain', '')).prefix).toBe('');
  });

  it('gives a qualified name in another namespace a code of its own', () => {
    const names = new NameTable();
    const first = names.code('x:item', 'urn:one');
    const second = names.code('x:item', 'urn:two');
    expect(second).not.toBe(first);
    expect(names.code('x:item', 'urn:two')).toBe(second);
    expect(names.code('x:item', 'urn:one')).toBe(first);
    expect(names.qName(second).namespaceURI).toBe('urn:two');
  });

  it('gives names that differ only in prefix one expanded-name id', () => {
    const names = new NameTable();
    const a = names.code('a:item', 'urn:x');
    const b = names.code('b:item', 'urn:x');
    const other = names.code('item', '');
    expect(names.expandedName(a)).toBe(names.expandedName(b));
    expect(names.expandedName(other)).not.toBe(names.expandedName(a));
    expect(names.expandedNames[b]).toBe(names.expandedName(a));
  });

  it('gives the one code of an expanded name, or says several codes share it', () => {
    const names = new NameTable();
    const item = names.code('item', '');
    const a = names.code('a:x', 'urn:x');
    names.code('b:x', 'urn:x');
    expect(names.singleCode(names.expandedName(item))).toBe(item);
    expect(names.singleCode(names.expandedName(a))).toBe(SEVERAL_CODES);
  });

  it('looks up expanded names without adding them', () => {
    const names = new NameTable();
    const code = names.code('p:item', 'urn:x');
    expect(names.lookup('urn:x', 'item')).toBe(names.expandedName(code));
    expect(names.lookup('urn:y', 'item')).toBe(NO_NAME);
    expect(names.size).toBe(1);
  });

  it('keeps one copy of each namespace URI', () => {
    const names = new NameTable();
    const uri = names.namespace('urn:a-namespace-longer-than-a-slice');
    expect(names.namespace(`urn:a-namespace-longer-than-a-slice${''}`)).toBe(uri);
    expect(names.namespace('')).toBe('');
    expect(names.qName(names.code('item', uri)).namespaceURI).toBe(uri);
  });
});
