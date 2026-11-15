import { describe, expect, it } from 'vitest';
import { NodeKind, type XdmNode } from '@exemplarjs/xdm';
import { XPathCompiler } from '@/index';
import { errorCode, strings } from '../../helpers/evaluate.ts';

/** The start of a `\uXXXX` escape, kept apart so that escapes stay as written. */
const U = String.raw`\u`;

/** A node written as compact XML: elements by local name, attributes sorted, text as it is. */
function written(node: XdmNode): string {
  if (node.kind === NodeKind.TEXT) return node.stringValue;
  const content = node
    .children()
    .map((child) => written(child))
    .join('');
  if (node.kind === NodeKind.DOCUMENT) return content;
  const attributes = node
    .attributes()
    .map((attribute) => ` ${attribute.localName}="${attribute.stringValue}"`)
    .toSorted()
    .join('');
  return `<${node.localName}${attributes}>${content}</${node.localName}>`;
}

/** The XML representation `json-to-xml` gives for an expression, written compactly. */
function xml(expression: string): string {
  const [document] = new XPathCompiler().compile(expression).evaluate(null);
  return written(document as XdmNode);
}

describe('json-to-xml', () => {
  it('writes each kind of value as its element', () => {
    expect(xml(`json-to-xml('{"a": [1.50, "x", true, false, null, {}, []]}')`)).toBe(
      '<map><array key="a"><number>1.50</number><string>x</string><boolean>true</boolean>' +
        '<boolean>false</boolean><null></null><map></map><array></array></array></map>'
    );
    expect(xml(`json-to-xml('"x"')`)).toBe('<string>x</string>');
  });

  it('puts the elements in the functions namespace, declared on the outermost one', () => {
    expect(strings(`json-to-xml('[1]')/*:array/*:number/namespace-uri()`)).toEqual([
      'http://www.w3.org/2005/xpath-functions',
    ]);
    expect(strings(`json-to-xml('[[1]]')/*/namespace::*[name() = '']`)).toEqual([
      'http://www.w3.org/2005/xpath-functions',
    ]);
  });

  it('gives a document node, or the empty sequence for the empty sequence', () => {
    expect(strings(`json-to-xml('1') instance of document-node(), empty(json-to-xml(()))`)).toEqual(['true', 'true']);
    expect(strings(`empty(json-to-xml((), map {'validate': false()}))`)).toEqual(['true']);
  });

  it('gives the document the static base URI', () => {
    expect(strings(`base-uri(json-to-xml('1'))`, null, { baseURI: 'http://example.com/q' })).toEqual([
      'http://example.com/q',
    ]);
    expect(strings(`empty(base-uri(json-to-xml('1')))`)).toEqual(['true']);
  });

  it('raises FOJS0001 for text that is not JSON', () => {
    expect(errorCode(`json-to-xml('[1,]')`)).toBe('FOJS0001');
  });

  it('retains duplicate keys by default, or keeps the first, or rejects them', () => {
    expect(xml(`json-to-xml('{"a": 1, "a": 2}')`)).toBe(
      '<map><number key="a">1</number><number key="a">2</number></map>'
    );
    expect(xml(`json-to-xml('{"a": 1, "b": 3, "a": 2}', map {'duplicates': 'use-first'})`)).toBe(
      '<map><number key="a">1</number><number key="b">3</number></map>'
    );
    expect(errorCode(`json-to-xml('{"a": 1, "a": 2}', map {'duplicates': 'reject'})`)).toBe('FOJS0003');
    expect(errorCode(`json-to-xml('{"a": 1, "b": 2}', map {'duplicates': 'reject'})`)).toBeUndefined();
  });

  it('raises FOJS0005 for a duplicates value it does not know', () => {
    expect(errorCode(`json-to-xml('[1]', map {'duplicates': 'use-last'})`)).toBe('FOJS0005');
  });

  it('raises FOJS0004 when asked to validate', () => {
    expect(errorCode(`json-to-xml('[1]', map {'validate': true()})`)).toBe('FOJS0004');
  });

  it('decodes escapes in strings and keys by default', () => {
    expect(
      strings(`json-to-xml('{"${U}0041\\t": "\\\\${U}0000"}')/*/*/(string(@key), string()) ! string-to-codepoints(.)`)
    ).toEqual(['65', '9', '92', '65533']);
  });

  it('keeps escapes and marks the strings and keys that hold them when escape is true', () => {
    expect(xml(`json-to-xml('"\\\\\\/\\"\\r\\t${U}0020"', map {'escape': true()})`)).toBe(
      String.raw`<string escaped="true">\\/"\r\t </string>`
    );
    expect(xml(`json-to-xml('{"a\\\\": "\\f", "b": "x", "${U}0007": "bell"}', map {'escape': true()})`)).toBe(
      String.raw`<map><string escaped-key="true" escaped="true" key="a\\">\f</string><string key="b">x</string>` +
        `<string escaped-key="true" key="${U}0007">bell</string></map>`
    );
  });

  it('does not mark escapes when escape is false', () => {
    expect(xml(`json-to-xml('{"\\\\": "\\\\"}', map {'escape': false()})`)).toBe(
      String.raw`<map><string key="\">\</string></map>`
    );
  });

  it('replaces characters XML cannot hold with what the fallback gives', () => {
    expect(xml(`json-to-xml('["${U}FFFF"]', map {'fallback': lower-case#1})`)).toBe(
      `<array><string>${U}ffff</string></array>`
    );
  });

  it('raises FOJS0005 for escape with a fallback', () => {
    expect(errorCode(`json-to-xml('[1]', map {'escape': true(), 'fallback': lower-case#1})`)).toBe('FOJS0005');
  });

  it('accepts liberal', () => {
    expect(xml(`json-to-xml('[1]', map {'liberal': true()})`)).toBe('<array><number>1</number></array>');
  });

  it('raises XPTY0004 for options of the wrong type', () => {
    expect(errorCode(`json-to-xml('[1]', map {'liberal': 'yes'})`)).toBe('XPTY0004');
    expect(errorCode(`json-to-xml('[1]', map {'validate': 0})`)).toBe('XPTY0004');
    expect(errorCode(`json-to-xml('[1]', map {'escape': ()})`)).toBe('XPTY0004');
    expect(errorCode(`json-to-xml('[1]', map {'duplicates': ('retain', 'reject')})`)).toBe('XPTY0004');
    expect(errorCode(`json-to-xml('[1]', map {'fallback': 'x'})`)).toBe('XPTY0004');
  });
});
