import { describe, expect, it } from 'vitest';
import { XPathCompiler, type XPathException } from '@/index';
import { errorCode, parse } from '../helpers/evaluate.ts';

const compiler = new XPathCompiler();

/** The one string an expression gives. */
function text(expression: string, contextItem = parse('<doc><a x="1">t</a></doc>')): string {
  return compiler.compile(expression).evaluateString(contextItem);
}

describe('serialize', () => {
  it('writes XML without a declaration by default, atomic values as text with spaces between them', () => {
    expect(text('serialize(/doc/a)')).toBe('<a x="1">t</a>');
    expect(text('serialize((1, 2, /doc/a, "x"))')).toBe('1 2<a x="1">t</a>x');
    expect(text('serialize(/)')).toBe('<doc><a x="1">t</a></doc>');
    expect(text('serialize(())')).toBe('');
  });

  it('flattens arrays, and writes the item separator between every item when one is given', () => {
    expect(text('serialize([1, [2, 3]])')).toBe('1 2 3');
    expect(text('serialize((1, 2, /doc/a), map { "item-separator": "|" })')).toBe('1|2|<a x="1">t</a>');
  });

  it('writes an XML declaration, and the standalone declaration, when asked', () => {
    expect(text('serialize(/doc/a, map { "omit-xml-declaration": false() })')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><a x="1">t</a>'
    );
    expect(text('serialize(/doc/a, map { "omit-xml-declaration": false(), "standalone": true() })')).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a x="1">t</a>'
    );
  });

  it('indents, but not inside the elements whose indentation is suppressed', () => {
    const nested = parse('<a><b><c/></b><p><c/></p></a>');
    expect(text('serialize(/, map { "indent": true() })', nested)).toBe(
      '<a>\n  <b>\n    <c/>\n  </b>\n  <p>\n    <c/>\n  </p>\n</a>'
    );
    expect(text('serialize(/, map { "indent": true(), "suppress-indentation": xs:QName("p") })', nested)).toBe(
      '<a>\n  <b>\n    <c/>\n  </b>\n  <p><c/></p>\n</a>'
    );
  });

  it('writes CDATA sections, character maps and a normalization form as asked', () => {
    const doc = parse('<a><s>x&lt;y</s><t>$e\u0301</t></a>');
    expect(text('serialize(/, map { "cdata-section-elements": xs:QName("s") })', doc)).toBe(
      '<a><s><![CDATA[x<y]]></s><t>$e\u0301</t></a>'
    );
    expect(text('serialize(/, map { "use-character-maps": map { "$": "&dollar;" } })', doc)).toBe(
      '<a><s>x&lt;y</s><t>&dollar;e\u0301</t></a>'
    );
    expect(text('serialize(/, map { "normalization-form": "NFC" })', doc)).toBe('<a><s>x&lt;y</s><t>$\u00E9</t></a>');
  });

  it('maps characters that regular expressions give meaning, in each method', () => {
    const doc = parse('<p a="1-2">a-b]c</p>');
    const maps = 'map { "-": "[dash]", "]": "[close]" }';
    for (const method of ['xml', 'html', 'xhtml']) {
      const options = `map { "method": "${method}", "omit-xml-declaration": true(), "use-character-maps": ${maps} }`;
      expect(text(`serialize(/, ${options})`, doc)).toBe('<p a="1[dash]2">a[dash]b[close]c</p>');
    }
    expect(text(`serialize(/, map { "method": "text", "use-character-maps": ${maps} })`, doc)).toBe('a[dash]b[close]c');
  });

  it('declares the namespaces each element needs, and undeclares a default namespace it does not have', () => {
    const doc = parse('<a xmlns="urn:a" xmlns:p="urn:p"><p:b><c xmlns=""/></p:b></a>');
    expect(text('serialize(//*:b)', doc)).toBe('<p:b xmlns="urn:a" xmlns:p="urn:p"><c xmlns=""/></p:b>');
  });

  it('undeclares prefixes in XML 1.1 when asked, and raises SEPM0010 for asking in XML 1.0', () => {
    const doc = parse('<?xml version="1.1"?><p:a xmlns:p="urn:p"><b xmlns:p=""/></p:a>');
    expect(text('serialize(/, map { "version": "1.1", "undeclare-prefixes": true() })', doc)).toBe(
      '<p:a xmlns:p="urn:p"><b xmlns:p=""/></p:a>'
    );
    expect(text('serialize(/, map { "version": "1.1" })', doc)).toBe('<p:a xmlns:p="urn:p"><b/></p:a>');
    expect(errorCode('serialize(parse-xml("<a/>"), map { "undeclare-prefixes": true() })')).toBe('SEPM0010');
    expect(errorCode('serialize(1, map { "version": "2.0" })')).toBe('SESU0013');
    expect(errorCode('serialize(1, map { "encoding": "no-such" })')).toBe('SESU0007');
  });

  it('writes a DOCTYPE the parameters ask for, and prefixed attributes', () => {
    const doc = parse('<a xmlns:p="urn:p" p:x="1"/>');
    expect(text('serialize(/, map { "doctype-system": "a.dtd", "doctype-public": "-//P" })', doc)).toBe(
      '<!DOCTYPE a PUBLIC "-//P" "a.dtd"><a xmlns:p="urn:p" p:x="1"/>'
    );
  });

  it('writes comments and processing instructions, at the top and inside elements', () => {
    const doc = parse('<?p data?><!--top--><a><!--c--><?q?></a>');
    expect(text('serialize(/)', doc)).toBe('<?p data?><!--top--><a><!--c--><?q?></a>');
  });

  it('escapes the characters an encoding cannot hold', () => {
    expect(text('serialize(parse-xml("<a>\u00E9</a>"), map { "encoding": "us-ascii" })')).toBe('<a>&#233;</a>');
  });

  it('raises SENR0001 for attributes, namespaces, maps and functions written by the XML and text methods', () => {
    expect(errorCode('serialize(/doc/a/@x)', parse('<doc><a x="1"/></doc>'))).toBe('SENR0001');
    expect(errorCode('serialize(map {})')).toBe('SENR0001');
    expect(errorCode('serialize(concat#2, map { "method": "text" })')).toBe('SENR0001');
    const doc = parse('<doc xmlns:p="urn:p"><a x="1"/></doc>');
    const messageOf = (expression: string): string => {
      try {
        new XPathCompiler().compile(expression).evaluate(doc);
      } catch (error) {
        return (error as XPathException).description;
      }
      return 'no error';
    };
    expect(messageOf('serialize(/doc/a/@x)')).toBe('An attribute node cannot be serialized by the XML or text method');
    expect(messageOf('serialize(/doc/namespace::p)')).toBe(
      'A namespace node cannot be serialized by the XML or text method'
    );
  });

  it('writes the text method: string values and text joined', () => {
    expect(text('serialize((1, /doc/a, "x"), map { "method": "text" })')).toBe('1tx');
    expect(text('serialize((1, 2), map { "method": "text", "item-separator": "-" })')).toBe('1-2');
    expect(text('serialize("a$b", map { "method": "text", "use-character-maps": map { "$": "S" } })')).toBe('aSb');
  });

  it('writes JSON: maps as objects, arrays, numbers, booleans, strings and null', () => {
    expect(text('serialize(map { "a": [1, 1.5, true(), (), "x/y"] }, map { "method": "json" })')).toBe(
      String.raw`{"a":[1,1.5,true,null,"x\/y"]}`
    );
    expect(text('serialize((), map { "method": "json" })')).toBe('null');
    expect(text('serialize([xs:float(1.5), 2.50, false()], map { "method": "json" })')).toBe('[1.5,2.5,false]');
    expect(text('serialize(xs:date("2020-01-01"), map { "method": "json" })')).toBe('"2020-01-01"');
    expect(text('serialize([1e0, -10000000e0], map { "method": "json" })')).toBe('[1,-1.0E7]');
  });

  it('writes nodes inside JSON as strings, serialized by the json-node-output-method', () => {
    expect(text('serialize([/doc/a], map { "method": "json" })')).toBe(String.raw`["<a x=\"1\">t<\/a>"]`);
    expect(text('serialize([/doc/a], map { "method": "json", "json-node-output-method": "text" })')).toBe('["t"]');
  });

  it('indents JSON, and escapes beyond ASCII in other encodings', () => {
    expect(text('serialize(map { "a": [1] }, map { "method": "json", "indent": true() })')).toBe(
      '{\n  "a": [\n    1\n  ]\n}'
    );
    expect(text('serialize("\u00E9", map { "method": "json", "encoding": "us-ascii" })')).toBe(String.raw`"\u00E9"`);
    expect(text('serialize("e\u0301", map { "method": "json", "normalization-form": "NFC" })')).toBe('"\u00E9"');
  });

  it('raises the JSON errors: SERE0020 for NaN, SERE0021 for functions, SERE0022 for a name twice, SERE0023 for a sequence', () => {
    expect(errorCode('serialize(xs:double("NaN"), map { "method": "json" })')).toBe('SERE0020');
    expect(errorCode('serialize(xs:double("INF"), map { "method": "json" })')).toBe('SERE0020');
    expect(errorCode('serialize(concat#2, map { "method": "json" })')).toBe('SERE0021');
    expect(errorCode('serialize(map { 1: 1, "1": 2 }, map { "method": "json" })')).toBe('SERE0022');
    expect(text('serialize(map { 1: 1, "1": 2 }, map { "method": "json", "allow-duplicate-names": true() })')).toBe(
      '{"1":1,"1":2}'
    );
    expect(errorCode('serialize((1, 2), map { "method": "json" })')).toBe('SERE0023');
    expect(errorCode('serialize([(1, 2)], map { "method": "json" })')).toBe('SERE0023');
  });

  it('writes the adaptive method: each item as XPath would write it, a line between items', () => {
    expect(
      text(
        'serialize((1.5, 1e0, -0e0, xs:double("NaN"), "q""t", xs:untypedAtomic("u"), true(), xs:float(2), xs:QName("fn:x"), 3), map { "method": "adaptive" })'
      )
    ).toBe(
      '1.5\n1.0e0\n-0.0e0\nNaN\n"q""t"\n"u"\ntrue()\nxs:float("2")\nQ{http://www.w3.org/2005/xpath-functions}x\n3'
    );
    expect(
      text(
        'serialize((map { "k": (1, 2) }, [()], [1, "x"], concat#2, function($x) { $x }), map { "method": "adaptive" })'
      )
    ).toBe('map{"k":(1,2)}\n[()]\n[1,"x"]\nfn:concat#2\n(anonymous-function)#1');
    expect(
      text('serialize((/doc/a, /doc/a/@x, xs:double("INF")), map { "method": "adaptive", "item-separator": " | " })')
    ).toBe('<a x="1">t</a> | x="1" | INF');
    expect(text('serialize((/doc/namespace::xml), map { "method": "adaptive" })')).toBe(
      'xmlns:xml="http://www.w3.org/XML/1998/namespace"'
    );
  });

  it('writes the adaptive method for the rarer values: negative infinity, fractions, URIs, a default namespace', () => {
    expect(text('serialize((-xs:double("INF"), 1.5e0, xs:anyURI("u"), false()), map { "method": "adaptive" })')).toBe(
      '-INF\n1.5e0\n"u"\nfalse()'
    );
    const scoped = parse('<a xmlns="urn:d"/>');
    expect(text('serialize(/*/namespace::*[name() = ""], map { "method": "adaptive" })', scoped)).toBe('xmlns="urn:d"');
  });

  it('raises SEPM0016 for a JSON node output method that cannot write a node', () => {
    for (const method of ['json', 'adaptive']) {
      expect(
        errorCode(`serialize(parse-xml("<a/>"), map { "method": "json", "json-node-output-method": "${method}" })`)
      ).toBe('SEPM0016');
    }
  });

  it('raises SEPM0016 for an output method it does not support', () => {
    expect(errorCode('serialize(1, map { "method": "other" })')).toBe('SEPM0016');
  });
});
