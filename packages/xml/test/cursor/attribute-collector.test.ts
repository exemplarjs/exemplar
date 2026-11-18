import { errorOf, parseEveryWay } from '@test/helpers/parse';
import { describe, expect, it } from 'vitest';

describe('attributes (§3.1)', () => {
  it('rejects an attribute that appears twice (WFC: Unique Att Spec)', () => {
    expect(errorOf('<a b="1" b="2"/>')).toMatchObject({ code: 'WF_DUPLICATE_ATTRIBUTE', column: 10 });
  });

  it('finds duplicates among many attributes', () => {
    const attributes = Array.from({ length: 30 }, (_, i) => ` a${i}="${i}"`).join('');
    expect(parseEveryWay(`<e${attributes}/>`)).toContain('a29="29"');
    expect(errorOf(`<e${attributes} a17="x"/>`).code).toBe('WF_DUPLICATE_ATTRIBUTE');
  });
});

describe('namespace errors in a start tag (Namespaces §3, §6.3)', () => {
  const XML = 'http://www.w3.org/XML/1998/namespace';
  const XMLNS = 'http://www.w3.org/2000/xmlns/';
  /** An ATTLIST for `a`, which makes the reader list the start tag's attributes as strings. */
  const DECLARED = '<!DOCTYPE a [<!ATTLIST a z CDATA #IMPLIED>]>';

  it.each([
    ['<a c="1" xmlns:xmlns="u"/>', 10, 'NS_RESERVED: The xmlns prefix and namespace only declare other prefixes'],
    [`<a xmlns:p="${XMLNS}"/>`, 4, 'NS_RESERVED: The xmlns prefix and namespace only declare other prefixes'],
    [`<a xmlns="${XMLNS}"/>`, 4, 'NS_RESERVED: The xmlns prefix and namespace only declare other prefixes'],
    ['<a xmlns:xml="u"/>', 4, 'NS_RESERVED: The xml prefix cannot be bound to u'],
    ['<a xmlns:xml="&#x75;"/>', 4, 'NS_RESERVED: The xml prefix cannot be bound to u'],
    [`<a xmlns:p="${XML}"/>`, 4, `NS_RESERVED: ${XML} needs the xml prefix`],
    [`<a xmlns="${XML}"/>`, 4, `NS_RESERVED: ${XML} needs the xml prefix`],
    ['<a c="1" xmlns:p=""/>', 10, 'NS_UNDECLARED_PREFIX: Namespaces in XML 1.0 do not allow undeclaring a prefix'],
    ['<a c="1" xmlns:p:q="u"/>', 10, 'NS_QNAME: xmlns:p:q is not a qualified name'],
    ['<a xmlns:p="u" p:1="x"/>', 16, 'NS_QNAME: p:1 is not a qualified name'],
    ['<a c="1" q:b="1"/>', 10, 'NS_UNBOUND_PREFIX: The prefix q is not bound'],
    [
      '<a xmlns:p="u" xmlns:q="u" p:b="1" q:b="2"/>',
      36,
      'NS_DUPLICATE_ATTRIBUTE: Attribute b appears twice in one namespace',
    ],
  ])('reports %s alike with and without declared attributes', (tag, column, message) => {
    expect(errorOf(tag)).toMatchObject({ column, message: `${message} (1:${column})` });
    const declaredColumn = DECLARED.length + column;
    expect(errorOf(DECLARED + tag)).toMatchObject({
      column: declaredColumn,
      message: `${message} (1:${declaredColumn})`,
    });
  });

  it('reports a namespace error in a defaulted attribute at the start tag', () => {
    const dtd = '<!DOCTYPE a [<!ATTLIST a q:b CDATA "x">]>';
    expect(errorOf(`${dtd}<a c="1"/>`)).toMatchObject({ code: 'NS_UNBOUND_PREFIX', column: dtd.length + 1 });
  });
});
