import { describe, expect, it } from 'vitest';
import { attributeIndex, locationOf, NOWHERE, StructureCheck } from '@/util/structure';

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
