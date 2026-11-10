import { describe, expect, it } from 'vitest';
import { parseUri, resolveReference } from '@/functions/core/uri-resolution';

/** A reference resolved against a base, both given as text. */
function resolve(reference: string, base: string): string {
  return resolveReference(
    parseUri(reference) as NonNullable<ReturnType<typeof parseUri>>,
    parseUri(base) as NonNullable<ReturnType<typeof parseUri>>
  );
}

describe('URI resolution', () => {
  it('splits URI references into their parts', () => {
    expect(parseUri('http://e.com:80/a/b?q=1#f')).toEqual({
      scheme: 'http',
      authority: 'e.com:80',
      path: '/a/b',
      query: 'q=1',
      fragment: 'f',
    });
    expect(parseUri('//e.com')).toEqual({
      scheme: undefined,
      authority: 'e.com',
      path: '',
      query: undefined,
      fragment: undefined,
    });
    expect(parseUri('a/b')).toMatchObject({ scheme: undefined, authority: undefined, path: 'a/b' });
  });

  it("rejects bad escapes and a colon in a relative path's first segment", () => {
    expect(parseUri('a%2')).toBeUndefined();
    expect(parseUri('a:b/c')).toMatchObject({ scheme: 'a' });
    expect(parseUri('1a:b')).toBeUndefined();
    expect(parseUri('./a:b')).toMatchObject({ path: './a:b' });
  });

  it('resolves the examples of RFC 3986 §5.4', () => {
    const base = 'http://a/b/c/d;p?q';
    const examples: [string, string][] = [
      ['g:h', 'g:h'],
      ['g', 'http://a/b/c/g'],
      ['./g', 'http://a/b/c/g'],
      ['g/', 'http://a/b/c/g/'],
      ['/g', 'http://a/g'],
      ['//g', 'http://g'],
      ['?y', 'http://a/b/c/d;p?y'],
      ['g?y', 'http://a/b/c/g?y'],
      ['#s', 'http://a/b/c/d;p?q#s'],
      ['', 'http://a/b/c/d;p?q'],
      ['.', 'http://a/b/c/'],
      ['./', 'http://a/b/c/'],
      ['..', 'http://a/b/'],
      ['../g', 'http://a/b/g'],
      ['../..', 'http://a/'],
      ['../../../g', 'http://a/g'],
      ['/./g', 'http://a/g'],
      ['g.', 'http://a/b/c/g.'],
      ['g;x=1/../y', 'http://a/b/c/y'],
    ];
    for (const [reference, resolved] of examples) expect(resolve(reference, base)).toBe(resolved);
  });

  it('merges with a base that has an authority and no path', () => {
    expect(resolve('g', 'http://a')).toBe('http://a/g');
  });

  it('removes leading dot segments and lone dots from a reference with a scheme of its own', () => {
    expect([
      resolve('foo:../a', 'http://a/b'),
      resolve('foo:./b', 'http://a/b'),
      resolve('foo:.', 'http://a/b'),
      resolve('foo:..', 'http://a/b'),
    ]).toEqual(['foo:a', 'foo:b', 'foo:', 'foo:']);
  });
});
