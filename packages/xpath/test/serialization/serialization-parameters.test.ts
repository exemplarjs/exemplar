import { describe, expect, it } from 'vitest';
import { XPathCompiler, XPathException } from '@/index';
import { parse } from '../helpers/evaluate.ts';

const OUTPUT = 'http://www.w3.org/2010/xslt-xquery-serialization';
const compiler = new XPathCompiler();

/** A parameters element with the given content, as the document element of a parsed document. */
function parametersElement(content: string, attributes = ''): ReturnType<typeof parse> {
  return parse(
    `<output:serialization-parameters xmlns:output="${OUTPUT}"${attributes}>${content}</output:serialization-parameters>`
  );
}

/** What serializing a document gives with a parameters element. */
function serializedWith(content: string, source = '<a><b>x</b></a>', attributes = ''): string {
  return compiler
    .compile('serialize(parse-xml($source), $params/*)', { variables: ['source', 'params'] })
    .evaluateString(null, { variables: { source, params: parametersElement(content, attributes) } });
}

/** The code of the error serializing with a parameters element raises. */
function elementError(content: string, attributes = ''): string | undefined {
  try {
    serializedWith(content, '<a/>', attributes);
    return undefined;
  } catch (error) {
    return (error as XPathException).code;
  }
}

/** The code of the error an expression raises. */
function errorCode(expression: string): string | undefined {
  try {
    compiler.compile(expression).evaluate();
    return undefined;
  } catch (error) {
    if (error instanceof XPathException) return error.code;
    throw error;
  }
}

describe('serialization parameters in a map', () => {
  it('converts values to their types, raising XPTY0004 for one that cannot be', () => {
    expect(compiler.compile('serialize(1, map { "indent": xs:untypedAtomic("true") })').evaluateString()).toBe('1');
    expect(errorCode('serialize(1, map { "indent": "yes" })')).toBe('XPTY0004');
    expect(errorCode('serialize(1, map { "cdata-section-elements": "a" })')).toBe('XPTY0004');
    expect(errorCode('serialize(1, map { "method": map {} })')).toBe('XPTY0004');
    expect(errorCode('serialize(1, map { "use-character-maps": map { "a": 1 } })')).toBe('XPTY0004');
  });

  it('takes a method as a string or a QName, raising SEPM0016 for one it does not know', () => {
    expect(compiler.compile('serialize(1, map { "method": xs:QName("text") })').evaluateString()).toBe('1');
    expect(errorCode('serialize(1, map { "method": QName("urn:x", "x:m") })')).toBe('SEPM0016');
  });

  it('raises SEPM0016 for a character map key that is not one character, and SESU0011 for an unknown normalization form', () => {
    expect(errorCode('serialize(1, map { "use-character-maps": map { "ab": "c" } })')).toBe('SEPM0016');
    expect(errorCode('serialize(1, map { "normalization-form": "fully-normalized" })')).toBe('SESU0011');
    expect(compiler.compile('serialize("e\u0301", map { "normalization-form": " none " })').evaluateString()).toBe(
      'e\u0301'
    );
  });

  it('leaves out an empty value, and keys it does not know', () => {
    expect(compiler.compile('serialize(1, map { "indent": (), "unknown": 1 })').evaluateString()).toBe('1');
  });

  it('raises XPTY0004 for parameters that are neither a map nor a parameters element', () => {
    expect(errorCode('serialize(1, "indent")')).toBe('XPTY0004');
    expect(errorCode('serialize(1, parse-xml("<serialization-parameters/>")/*)')).toBe('XPTY0004');
  });
});

describe('serialization parameters in an element', () => {
  it('reads yes and no as yes, true or 1 and no, false or 0, with whitespace around', () => {
    expect(serializedWith('<output:omit-xml-declaration value=" no "/>')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><a><b>x</b></a>'
    );
    expect(serializedWith('<output:indent value="1"/><output:omit-xml-declaration value="true"/>')).toBe(
      '<a>\n  <b>x</b>\n</a>'
    );
    expect(elementError('<output:indent value="maybe"/>')).toBe('SEPM0017');
  });

  it('reads standalone as yes, no or omit', () => {
    const declared = (value: string): string =>
      serializedWith(`<output:omit-xml-declaration value="no"/><output:standalone value="${value}"/>`, '<a/>');
    expect(declared('yes')).toContain('standalone="yes"');
    expect(declared(' no ')).toContain('standalone="no"');
    expect(declared('omit')).not.toContain('standalone');
  });

  it('reads names as EQNames or as QNames with the prefixes the element declares, unprefixed in no namespace', () => {
    const source = '<a xmlns:p="urn:p"><p:s>&lt;</p:s><s>&lt;</s><q>&lt;</q></a>';
    expect(serializedWith('<output:cdata-section-elements xmlns:x="urn:p" value=" x:s Q{}q "/>', source)).toBe(
      '<a xmlns:p="urn:p"><p:s><![CDATA[<]]></p:s><s>&lt;</s><q><![CDATA[<]]></q></a>'
    );
    expect(serializedWith('<output:cdata-section-elements value="s"/>', source)).toBe(
      '<a xmlns:p="urn:p"><p:s>&lt;</p:s><s><![CDATA[<]]></s><q>&lt;</q></a>'
    );
    expect(elementError('<output:cdata-section-elements value="y:s"/>')).toBe('SEPM0017');
    expect(elementError('<output:cdata-section-elements value="1:2:3"/>')).toBe('SEPM0017');
    for (const name of ['Q{u}1x', 'Q{u}a:b', '1x:a', 'a:1x', 'a:']) {
      expect(elementError(`<output:cdata-section-elements value="${name}"/>`)).toBe('SEPM0017');
    }
  });

  it('reads a method, raising SEPM0016 for one in another namespace and SEPM0017 for an unknown one', () => {
    expect(serializedWith('<output:method value=" text "/>')).toBe('x');
    expect(elementError('<output:method xmlns:m="urn:m" value="m:method"/>')).toBe('SEPM0016');
    expect(elementError('<output:method value="Q{urn:m}method"/>')).toBe('SEPM0016');
    expect(elementError('<output:method value="other"/>')).toBe('SEPM0017');
  });

  it('reads a character map from character-map elements', () => {
    expect(
      serializedWith(
        '<output:use-character-maps><output:character-map character="x" map-string="&amp;x;"/></output:use-character-maps>'
      )
    ).toBe('<a><b>&x;</b></a>');
  });

  it('raises SEPM0017 for a character map that is not as Serialization defines it, and SEPM0018 for a character mapped twice', () => {
    const map = (content: string): string | undefined =>
      elementError(`<output:use-character-maps>${content}</output:use-character-maps>`);
    expect(map('<output:character-map character="$" map-string="S" rate="1"/>')).toBe('SEPM0017');
    expect(map('<output:character-mapping character="$" map-string="S"/>')).toBe('SEPM0017');
    expect(map('<output:character-map character="$$" map-string="S"/>')).toBe('SEPM0017');
    expect(map('<output:character-map map-string="S"/>')).toBe('SEPM0017');
    expect(elementError('<output:use-character-maps value="yes"/>')).toBe('SEPM0017');
    expect(
      map('<output:character-map character="$" map-string="S"/><output:character-map character="$" map-string="T"/>')
    ).toBe('SEPM0018');
    expect(
      map('<!--c--><output:character-map character="$" map-string="S" xmlns:v="urn:v" v:note="1"/>')
    ).toBeUndefined();
  });

  it('raises SEPM0017 for an unknown parameter, a parameter in no namespace, or attributes it does not define', () => {
    expect(elementError('<output:outdent value="yes"/>')).toBe('SEPM0017');
    expect(elementError('<indent value="yes"/>')).toBe('SEPM0017');
    expect(elementError('<output:indent value="yes" value2="no"/>')).toBe('SEPM0017');
    expect(elementError('<output:indent/>')).toBe('SEPM0017');
    expect(elementError('<output:indent value="yes"/>', ' value2="no"')).toBe('SEPM0017');
  });

  it('raises SEPM0019 for a parameter given twice, even one in another namespace', () => {
    expect(elementError('<output:indent value="yes"/><output:indent value="no"/>')).toBe('SEPM0019');
    expect(elementError('<v:p xmlns:v="urn:v" value="1"/><v:p xmlns:v="urn:v" value="2"/>')).toBe('SEPM0019');
  });

  it('leaves alone parameters and attributes in other namespaces, text, comments, and strings', () => {
    expect(
      serializedWith(
        '<v:indent xmlns:v="urn:v" value="maybe"/> <!--c--><output:doctype-public value="-//P"/><output:html-version value="5.0"/>',
        '<a/>',
        ' xmlns:v="urn:v" v:x="1"'
      )
    ).toBe('<a/>');
    expect(elementError('<output:html-version value="five"/>')).toBe('SEPM0017');
  });

  it('reads a decimal only as xs:decimal writes one, with XML whitespace around', () => {
    expect(serializedWith('<output:method value="html"/><output:html-version value=" 4.01 "/>', '<p/>')).toBe(
      '<p></p>'
    );
    for (const value of ['0x5', '5e0', '', ' ', 'Infinity', '+', '.']) {
      expect(elementError(`<output:html-version value="${value}"/>`)).toBe('SEPM0017');
    }
  });

  it('takes only XML whitespace around a value, not other spaces such as U+00A0', () => {
    expect(elementError('<output:indent value="yes&#xA0;"/>')).toBe('SEPM0017');
    expect(elementError('<output:method value="&#xA0;text"/>')).toBe('SEPM0017');
    expect(elementError('<output:standalone value="omit&#xA0;"/>')).toBe('SEPM0017');
    expect(elementError('<output:normalization-form value="NFC&#x2003;"/>')).toBe('SESU0011');
    // A name list splits at XML whitespace only, so a U+00A0 between two names leaves one name that is not a QName.
    expect(elementError('<output:cdata-section-elements value="a&#xA0;b"/>')).toBe('SEPM0017');
  });
});
