import { describe, expect, it } from 'vitest';
import { TreeBuilder, XdmNode } from '@exemplarjs/xdm';
import { errorCode, parse, strings } from '../../helpers/evaluate.ts';

/** The start of a `\uXXXX` escape, kept apart so that escapes stay as written. */
const U = String.raw`\u`;

/** A document holding XML in the functions namespace as its default namespace. */
function json(xml: string): XdmNode {
  return parse(xml.replace(/^<(\w+)/, '<$1 xmlns="http://www.w3.org/2005/xpath-functions"'));
}

/** The JSON text `xml-to-json` gives for a document. */
function converted(xml: string): string | undefined {
  return strings('xml-to-json(.)', json(xml))[0];
}

/** The error `xml-to-json` raises for a document. */
function failure(xml: string): string | undefined {
  return errorCode('xml-to-json(.)', json(xml));
}

/** A document built directly, with what its children are added by. */
function documentOf(add: (builder: TreeBuilder) => void): XdmNode {
  const builder = new TreeBuilder();
  builder.startDocument(null);
  add(builder);
  builder.endDocument();
  return XdmNode.of(builder.finish(), 0);
}

describe('xml-to-json', () => {
  it('writes each element as its JSON value', () => {
    expect(
      converted(
        '<map><array key="a"><number>1.50</number><string>x</string><boolean>1</boolean>' +
          '<boolean> false </boolean><null/><map/><array/></array></map>'
      )
    ).toBe('{"a":[1.5,"x",true,false,null,{},[]]}');
  });

  it('raises FOJS0006 for a key on an element not within a map, but allows one on the outermost', () => {
    expect(failure('<array><number key="a">1</number></array>')).toBe('FOJS0006');
    expect(failure('<array><string escaped-key="true">a</string></array>')).toBe('FOJS0006');
    expect(converted('<string key="k">a</string>')).toBe('"a"');
  });

  it('allows only XML whitespace beside elements and in null, not other spaces', () => {
    expect(failure('<map>&#xA0;<string key="a"/></map>')).toBe('FOJS0006');
    expect(failure('<array>&#x2003;</array>')).toBe('FOJS0006');
    expect(failure('<null>&#xA0;</null>')).toBe('FOJS0006');
    expect(converted('<array> &#x9;&#xA;<null> </null></array>')).toBe('[null]');
  });

  it('writes numbers as doubles cast to strings', () => {
    expect(converted('<array><number> 1 </number><number>1e100</number><number>-0</number></array>')).toBe(
      '[1,1.0E100,-0]'
    );
  });

  it('accepts an element as well as a document, and gives the empty sequence for none', () => {
    expect(strings('xml-to-json(/*/*[2])', json('<array><null/><string>b</string></array>'))).toEqual(['"b"']);
    expect(strings('empty(xml-to-json(())), empty(xml-to-json((), map {}))')).toEqual(['true', 'true']);
  });

  it('round-trips the result of json-to-xml', () => {
    expect(strings(`xml-to-json(json-to-xml('{"a": [1, "b", null, true]}'))`)).toEqual(['{"a":[1,"b",null,true]}']);
  });

  it('ignores whitespace, comments, processing instructions and attributes in other namespaces', () => {
    expect(converted('<map xmlns:o="urn:o" o:note="x">\n <!-- c --> <?pi?> <null key="a" o:n="1"/>\n</map>')).toBe(
      '{"a":null}'
    );
  });

  it('escapes quotes, backslashes, solidi and controls in strings', () => {
    expect(converted('<string>"\\/&#9;&#10;&#13;\u{7F}\u{9F}x</string>')).toBe(
      String.raw`"\"\\\/\t\n\r` + `${U}007F${U}009Fx"`
    );
  });

  it('keeps the escapes of strings and keys marked as escaped', () => {
    expect(converted(String.raw`<string escaped="true">\\\b\f\n\r\t\/\"` + `${U}00a0"&#9;</string>`)).toBe(
      String.raw`"\\\b\f\n\r\t\/\"` + `${U}00a0` + String.raw`\"\t"`
    );
    expect(converted(String.raw`<map><null key="a\n" escaped-key="1"/></map>`)).toBe(String.raw`{"a\n":null}`);
    expect(converted(String.raw`<map><null key="a\n" escaped-key="false"/></map>`)).toBe(String.raw`{"a\\n":null}`);
    expect(converted('<string escaped="true">a/b</string>')).toBe(String.raw`"a\/b"`);
  });

  it('raises FOJS0007 for a string or key marked as escaped that holds an escape that is not one', () => {
    expect(failure(String.raw`<string escaped="true">\x22</string>`)).toBe('FOJS0007');
    expect(failure(`<string escaped="true">${U}ABC</string>`)).toBe('FOJS0007');
    expect(failure(String.raw`<map><null key="\" escaped-key="true"/></map>`)).toBe('FOJS0007');
  });

  it('lays the JSON out on indented lines when indent is true', () => {
    const xml = '<map><array key="a"><number>1</number><map/></array><array key="b"/><null key="c"/></map>';
    expect(strings(`xml-to-json(., map {'indent': true()})`, json(xml))).toEqual([
      '{\n  "a": [\n    1,\n    {}\n  ],\n  "b": [],\n  "c": null\n}',
    ]);
    expect(strings(`xml-to-json(., map {'indent': false()})`, json(xml))).toEqual(['{"a":[1,{}],"b":[],"c":null}']);
  });

  it('raises FOJS0006 for elements that are not of the representation', () => {
    expect(errorCode('xml-to-json(.)', parse('<map/>'))).toBe('FOJS0006');
    expect(failure('<object/>')).toBe('FOJS0006');
    expect(failure('<array><item/></array>')).toBe('FOJS0006');
  });

  it('raises FOJS0006 for attributes the representation does not have', () => {
    expect(failure('<array><null other="1"/></array>')).toBe('FOJS0006');
    expect(failure('<array><number escaped="true">1</number></array>')).toBe('FOJS0006');
    expect(failure('<string escaped="maybe">x</string>')).toBe('FOJS0006');
    expect(failure('<map><null key="a" escaped-key="maybe"/></map>')).toBe('FOJS0006');
  });

  it('raises FOJS0006 for map members without a key or with a key given twice', () => {
    expect(failure('<map><null/></map>')).toBe('FOJS0006');
    expect(failure('<map><null key="a"/><null key="a"/></map>')).toBe('FOJS0006');
    expect(failure(`<map><null key="A"/><null key="${U}0041" escaped-key="true"/></map>`)).toBe('FOJS0006');
  });

  it('raises FOJS0006 for text or elements where they cannot be', () => {
    expect(failure('<map>x</map>')).toBe('FOJS0006');
    expect(failure('<array><null/>x</array>')).toBe('FOJS0006');
    expect(failure('<string><null/></string>')).toBe('FOJS0006');
    expect(failure('<null>x</null>')).toBe('FOJS0006');
    expect(failure('<null><null/></null>')).toBe('FOJS0006');
    expect(failure('<number><null/></number>')).toBe('FOJS0006');
    expect(failure('<boolean><null/></boolean>')).toBe('FOJS0006');
  });

  it('raises FOJS0006 for numbers and booleans that are not valid', () => {
    for (const xml of [
      '<number>x</number>',
      '<number>INF</number>',
      '<number>NaN</number>',
      '<boolean>yes</boolean>',
    ]) {
      expect(failure(xml), xml).toBe('FOJS0006');
    }
  });

  it('raises FOJS0006 for a node other than a document or element, or a document without one element', () => {
    expect(errorCode('xml-to-json(//@key)', json('<map><null key="a"/></map>'))).toBe('FOJS0006');
    expect(errorCode('xml-to-json(//text())', json('<string>x</string>'))).toBe('FOJS0006');
    expect(
      errorCode(
        'xml-to-json(.)',
        documentOf(() => undefined)
      )
    ).toBe('FOJS0006');
    expect(
      errorCode(
        'xml-to-json(.)',
        documentOf((builder) => builder.text('x'))
      )
    ).toBe('FOJS0006');
  });

  it('raises XPTY0004 for an indent of the wrong type, or input that is not one node', () => {
    expect(errorCode(`xml-to-json(., map {'indent': 'yes'})`, json('<null/>'))).toBe('XPTY0004');
    expect(errorCode(`xml-to-json('<null/>')`)).toBe('XPTY0004');
    expect(errorCode('xml-to-json((., .))', json('<null/>'))).toBe('XPTY0004');
  });
});
