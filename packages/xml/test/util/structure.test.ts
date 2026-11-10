import { describe, expect, it } from 'vitest';
import { attributeIndex, checkName, checkQName, locationOf, NOWHERE, StructureCheck } from '@/util/structure';

const HERE = { line: 3, column: 4, offset: 0 };

/** The code and location a call fails with. */
function failure(call: () => void): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('StructureCheck', () => {
  it('passes a well-formed document, counting the open elements', () => {
    const check = new StructureCheck(() => HERE);
    check.outsideRoot(true);
    check.startElement('a');
    check.startElement('b');
    expect(check.depth).toBe(2);
    check.endElement('b');
    check.endElement('a');
    check.endDocument();
    expect(check.depth).toBe(0);
  });

  it.each([
    ['a second root', ['a', '/a', 'b'], 'WF_SECOND_ROOT', 'A second root element'],
    ['an end tag with no start tag', ['/a'], 'WF_END_TAG_MISMATCH', 'An end tag a with no start tag'],
    ['an end tag for another element', ['a', '/b'], 'WF_END_TAG_MISMATCH', 'An end tag b where element a is open'],
    ['text outside the root', ['text'], 'WF_CONTENT_OUTSIDE_ROOT', 'Text outside the root element'],
    ['an element still open at the end', ['a', 'end'], 'WF_UNCLOSED_ELEMENT', 'Elements still open at the end'],
    ['no root', ['end'], 'WF_EMPTY_DOCUMENT', 'No root element'],
  ])('fails on %s, where the location says', (_case, steps, code, message) => {
    const check = new StructureCheck(() => HERE);
    const run = (): void => {
      for (const step of steps) {
        if (step === 'end') check.endDocument();
        else if (step === 'text') check.outsideRoot(false);
        else if (step.startsWith('/')) check.endElement(step.slice(1));
        else check.startElement(step);
      }
    };
    expect(failure(run)).toMatchObject({ code, description: message, line: 3, column: 4 });
  });
});

describe('checkQName and checkName', () => {
  const where = (): typeof HERE => HERE;

  it('pass names that are well formed and agree with their parts', () => {
    expect(() => checkQName('element', 'p:a', 'a', 'p', 'urn:p', where)).not.toThrow();
    expect(() => checkQName('element', 'a', 'a', '', '', where)).not.toThrow();
    expect(() => checkName('element', 'a:b', where)).not.toThrow();
  });

  it.each([
    ['a local name that is no NCName', ['1a', '1a', '', 'urn:x'], 'NS_QNAME'],
    ['a prefix that is no NCName', ['1p:a', 'a', '1p', 'urn:x'], 'NS_QNAME'],
    ['a name that disagrees with its parts', ['a', 'b', '', ''], 'NS_QNAME'],
    ['a prefix with no namespace', ['p:a', 'a', 'p', ''], 'NS_UNBOUND_PREFIX'],
  ])('fail on %s', (_case, [name, localName, prefix, uri], code) => {
    const error = failure(() =>
      checkQName('element', name as string, localName as string, prefix as string, uri as string, where)
    );
    expect(error).toMatchObject({ code, description: expect.stringMatching(/^An element /) });
  });

  it('check the parts of a name it has seen before against the name', () => {
    expect(() => checkQName('element', 'seen', 'seen', '', '', where)).not.toThrow();
    expect(failure(() => checkQName('element', 'seen', '1seen', '', '', where))).toMatchObject({ code: 'NS_QNAME' });
    expect(failure(() => checkQName('element', 'a', 'x', '', '', where))).toMatchObject({
      description: expect.stringContaining('named a with local name x and no prefix; a rename changes all three'),
    });
    expect(failure(() => checkQName('element', 'a', '1x', '', '', where))).toMatchObject({
      description: expect.stringContaining('with local name 1x and no prefix'),
    });
    expect(failure(() => checkQName('element', 'p:a', 'x', 'p', 'urn:p', where))).toMatchObject({
      description: expect.stringContaining('named p:a with local name x and prefix p; a rename changes all three'),
    });
    expect(failure(() => checkQName('element', 'q:seen', 'seen', 'p', 'urn:p', where))).toMatchObject({
      code: 'NS_QNAME',
    });
  });

  it('check names past the many it remembers', () => {
    for (let i = 0; i < 5000; i++) expect(() => checkQName('element', `n${i}`, `n${i}`, '', '', where)).not.toThrow();
  });

  it('check only that a name is a Name with namespaces off', () => {
    expect(failure(() => checkName('attribute', '1a', where))).toMatchObject({
      code: 'WF_NAME',
      description: 'An attribute named 1a, which is not a name',
    });
  });
});

describe('locationOf', () => {
  it('gives where a locator says, and nowhere in particular without one', () => {
    expect(locationOf(undefined)).toBe(NOWHERE);
    expect(locationOf({ lineNumber: 2, columnNumber: 3, systemId: undefined })).toEqual({
      line: 2,
      column: 3,
      offset: 0,
    });
    expect(locationOf({ lineNumber: 2, columnNumber: 3, systemId: 'file:///a' })).toEqual({
      line: 2,
      column: 3,
      offset: 0,
      systemId: 'file:///a',
    });
  });
});

describe('attributeIndex', () => {
  const attributes = {
    length: 2,
    qName: (i: number) => ['p:x', 'y'][i] as string,
    uri: (i: number) => ['urn:p', ''][i] as string,
    localName: (i: number) => ['x', 'y'][i] as string,
  };

  it('finds an attribute by qualified name, or by namespace URI and local name', () => {
    expect([
      attributeIndex(attributes, 'p:x'),
      attributeIndex(attributes, '', 'y'),
      attributeIndex(attributes, 'urn:p', 'y'),
      attributeIndex(attributes, 'z'),
    ]).toEqual([0, 1, -1, -1]);
  });
});
