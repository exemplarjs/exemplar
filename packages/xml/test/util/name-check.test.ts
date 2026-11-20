import { describe, expect, it } from 'vitest';
import { NameCheck } from '@/util/name-check';

const HERE = { line: 3, column: 4, offset: 0 };

/** The error a call fails with. */
function failure(call: () => void): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('NameCheck', () => {
  const check = new NameCheck(() => HERE);

  it('pass names that are well formed and agree with their parts', () => {
    expect(() => check.checkQName('element', 'p:a', 'a', 'p', 'urn:p')).not.toThrow();
    expect(() => check.checkQName('element', 'a', 'a', '', '')).not.toThrow();
    expect(() => check.checkName('element', 'a:b')).not.toThrow();
  });

  it.each([
    ['a local name that is no NCName', ['1a', '1a', '', 'urn:x'], 'NS_QNAME'],
    ['a prefix that is no NCName', ['1p:a', 'a', '1p', 'urn:x'], 'NS_QNAME'],
    ['a name that disagrees with its parts', ['a', 'b', '', ''], 'NS_QNAME'],
    ['a prefix with no namespace', ['p:a', 'a', 'p', ''], 'NS_UNBOUND_PREFIX'],
  ])('fail on %s', (_case, [name, localName, prefix, uri], code) => {
    const error = failure(() =>
      check.checkQName('element', name as string, localName as string, prefix as string, uri as string)
    );
    expect(error).toMatchObject({ code, description: expect.stringMatching(/^An element /) });
  });

  it('check the parts of a name it has seen before against the name', () => {
    expect(() => check.checkQName('element', 'seen', 'seen', '', '')).not.toThrow();
    expect(failure(() => check.checkQName('element', 'seen', '1seen', '', ''))).toMatchObject({ code: 'NS_QNAME' });
    expect(failure(() => check.checkQName('element', 'a', 'x', '', ''))).toMatchObject({
      description: expect.stringContaining('named a with local name x and no prefix; a rename changes all three'),
    });
    expect(failure(() => check.checkQName('element', 'a', '1x', '', ''))).toMatchObject({
      description: expect.stringContaining('with local name 1x and no prefix'),
    });
    expect(failure(() => check.checkQName('element', 'p:a', 'x', 'p', 'urn:p'))).toMatchObject({
      description: expect.stringContaining('named p:a with local name x and prefix p; a rename changes all three'),
    });
    expect(failure(() => check.checkQName('element', 'q:seen', 'seen', 'p', 'urn:p'))).toMatchObject({
      code: 'NS_QNAME',
    });
  });

  it('check more names than the cache of them holds, each check with its own', () => {
    for (let i = 0; i < 5000; i++) expect(() => check.checkQName('element', `n${i}`, `n${i}`, '', '')).not.toThrow();
    // A check that has not seen the name tells of its parts, as no name vouches for them.
    expect(failure(() => new NameCheck(() => HERE).checkQName('element', 'seen', '1seen', '', ''))).toMatchObject({
      description: expect.stringContaining('with local name 1seen and no prefix'),
    });
  });

  it('keep the names they pass in the sets they are told to make, those with a prefix apart from those without', () => {
    const made: Set<string>[] = [];
    const given = new NameCheck(
      () => HERE,
      () => {
        const names = new Set<string>();
        made.push(names);
        return names;
      }
    );
    given.checkQName('element', 'p:a', 'a', 'p', 'urn:p');
    given.checkQName('element', 'b', 'b', '', '');
    expect(() => given.checkQName('element', 'p:a', 'a', 'p', 'urn:p')).not.toThrow();
    expect(failure(() => given.checkQName('element', 'c', '1c', '', ''))).toMatchObject({ code: 'NS_QNAME' });
    expect(made.map((names) => [...names])).toEqual([['b'], ['p:a']]);
  });

  it('refuse a name it has passed with a prefix when the same text is given as a local name', () => {
    const fresh = new NameCheck(() => HERE);
    fresh.checkQName('element', 'p:a', 'a', 'p', 'urn:p');
    expect(failure(() => fresh.checkQName('element', 'p:a', 'p:a', '', 'urn:p'))).toMatchObject({
      code: 'NS_QNAME',
      description: expect.stringContaining('with local name p:a and no prefix'),
    });
  });

  it('check only that a name is a Name with namespaces off', () => {
    expect(failure(() => check.checkName('attribute', '1a'))).toMatchObject({
      code: 'WF_NAME',
      description: 'An attribute named 1a, which is not a name',
    });
  });
});
