import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, parse } from '../helpers/evaluate.ts';

const compiler = new XPathCompiler();

/** A document serialized by a method, with more parameters as map entries. */
function serialized(method: 'html' | 'xhtml', xml: string, parameters = ''): string {
  const more = parameters === '' ? '' : `, ${parameters}`;
  return compiler.compile(`serialize(/, map { "method": "${method}"${more} })`).evaluateString(parse(xml));
}

/** The error a document's serialization raises. */
function serializeError(method: 'html' | 'xhtml', xml: string, parameters = ''): string | undefined {
  const more = parameters === '' ? '' : `, ${parameters}`;
  return errorCode(`serialize(/, map { "method": "${method}"${more} })`, parse(xml));
}

const NO_META = '"include-content-type": false()';

describe('the HTML output method', () => {
  it('writes void elements without end tags and other empty elements with them, after the HTML5 DOCTYPE', () => {
    expect(serialized('html', '<html><body><p/><br/><img src="a.png"/><BR/></body></html>')).toBe(
      '<!DOCTYPE html><html><body><p></p><br><img src="a.png"><BR></body></html>'
    );
    expect(serialized('html', '<div><br/></div>')).toBe('<div><br></div>');
  });

  it('adds a content type meta element as the first child of head, replacing one already there', () => {
    expect(
      serialized('html', '<html><head><title>T</title><META HTTP-EQUIV=" content-type " content="x"/></head></html>')
    ).toBe(
      '<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>T</title></head></html>'
    );
    expect(serialized('html', '<html><head/></html>', '"media-type": "text/plain", "encoding": "us-ascii"')).toBe(
      '<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/plain; charset=us-ascii"></head></html>'
    );
    expect(serialized('html', '<html><head/></html>', NO_META)).toBe('<!DOCTYPE html><html><head></head></html>');
  });

  it('writes script and style as they are, and escapes text elsewhere', () => {
    expect(
      serialized('html', '<div><script>if (a &lt; b &amp;&amp; c) f()</script><style>a&gt;b{}</style></div>')
    ).toBe('<div><script>if (a < b && c) f()</script><style>a>b{}</style></div>');
    expect(serialized('html', '<p>a &lt; b &amp; c &gt; d</p>')).toBe('<p>a &lt; b &amp; c &gt; d</p>');
    expect(serializeError('html', '<script>é</script>', '"encoding": "us-ascii"')).toBe('SERE0008');
  });

  it('minimizes boolean attributes, leaves < and &{ in attributes, and escapes the rest', () => {
    expect(serialized('html', '<select><option selected="SELECTED" value="a&lt;b&amp;c&quot;"/></select>')).toBe(
      '<select><option selected value="a<b&amp;c&quot;"></option></select>'
    );
    expect(serialized('html', '<option selected="no" title="&amp;{x};"/>')).toBe(
      '<option selected="no" title="&{x};"></option>'
    );
  });

  it('escapes non-ASCII characters in URI attributes, unless asked not to', () => {
    expect(serialized('html', '<p><a href="café x.html" title="café"/></p>')).toBe(
      '<p><a href="caf%C3%A9 x.html" title="café"></a></p>'
    );
    expect(serialized('html', '<a href="café.html"/>', '"escape-uri-attributes": false()')).toBe(
      '<a href="café.html"></a>'
    );
  });

  it('ends processing instructions with >, raising SERE0015 for > inside one, and writes comments', () => {
    expect(serialized('html', '<p><?php echo 1?><?empty?><!--c--></p>')).toBe('<p><?php echo 1><?empty><!--c--></p>');
    expect(serializeError('html', '<p><?php a > b?></p>')).toBe('SERE0015');
  });

  it('writes elements in other namespaces as XML, and XHTML, SVG and MathML ones unprefixed in HTML5', () => {
    const svg =
      '<html><body><s:svg xmlns:s="http://www.w3.org/2000/svg"><s:rect/></s:svg><x:a xmlns:x="urn:x"/></body></html>';
    expect(serialized('html', svg)).toBe(
      '<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg><x:a xmlns:x="urn:x"></x:a></body></html>'
    );
    expect(serialized('html', '<h:p xmlns:h="http://www.w3.org/1999/xhtml"><h:br/></h:p>')).toBe(
      '<p xmlns="http://www.w3.org/1999/xhtml"><br></p>'
    );
    expect(serialized('html', '<s:svg xmlns:s="http://www.w3.org/2000/svg" s:v="1"/>')).toBe(
      '<svg xmlns:s="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" s:v="1"></svg>'
    );
  });

  it('writes DOCTYPEs from the parameters, and HTML 4 rules for an earlier html-version', () => {
    expect(serialized('html', '<html/>', '"doctype-public": "-//W3C//DTD HTML 4.01//EN"')).toBe(
      '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"><html></html>'
    );
    expect(serialized('html', '<html/>', '"doctype-public": "p", "doctype-system": "s"')).toBe(
      '<!DOCTYPE html PUBLIC "p" "s"><html></html>'
    );
    expect(serialized('html', '<html><basefont/></html>', '"html-version": 4.01')).toBe('<html><basefont></html>');
    expect(serialized('html', '<html><keygen/></html>', '"html-version": 4.01')).toBe('<html><keygen></keygen></html>');
    expect(serializeError('html', '<p>\u0085</p>', '"html-version": 4.0')).toBe('SERE0014');
    expect(serializeError('html', '<p/>', '"html-version": 6')).toBe('SESU0013');
    expect(serializeError('html', '<p/>', '"encoding": "no-such"')).toBe('SESU0007');
  });

  it('indents block content, but not inline content, pre or suppressed elements', () => {
    const page = '<html><body><div> <p>a <b>b</b></p><pre><i>x</i></pre></div><ul><li>1</li></ul></body></html>';
    expect(serialized('html', page, `"indent": true(), ${NO_META}, "suppress-indentation": xs:QName("ul")`)).toBe(
      '<!DOCTYPE html>\n<html>\n  <body>\n    <div>\n      <p>a <b>b</b></p>\n      <pre><i>x</i></pre>\n    </div>\n    <ul><li>1</li></ul>\n  </body>\n</html>'
    );
  });

  it('keeps text of spaces XML does not count as whitespace, such as U+00A0, and indents around none of it', () => {
    expect(serialized('html', '<div>&#xA0;<p>x</p></div>', '"indent": true()')).toBe('<div>\u00A0<p>x</p></div>');
    expect(serialized('xhtml', '<div>&#xA0;<p>x</p></div>', '"indent": true(), "omit-xml-declaration": true()')).toBe(
      '<div>\u00A0<p>x</p></div>'
    );
  });

  it('applies character maps, normalization and the encoding to text and attributes', () => {
    expect(
      serialized(
        'html',
        '<p title="$é">$é</p>',
        '"use-character-maps": map { "$": "&#36;" }, "normalization-form": "NFC", "encoding": "us-ascii"'
      )
    ).toBe('<p title="&#36;&#233;">&#36;&#233;</p>');
  });
});

describe('the XHTML output method', () => {
  it('writes void elements as <br /> and other empty HTML elements with end tags, others as XML', () => {
    const page = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p/><br/><x:a xmlns:x="urn:x"/></body></html>';
    expect(serialized('xhtml', page, NO_META)).toBe(
      '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><body><p></p><br /><x:a xmlns:x="urn:x"></x:a></body></html>'
    );
    expect(serialized('xhtml', '<html><body><br/><foo/></body></html>')).toBe(
      '<!DOCTYPE html><html><body><br /><foo></foo></body></html>'
    );
  });

  it('escapes script text as XML, ends processing instructions with ?>, and writes CDATA sections when asked', () => {
    expect(
      serialized('xhtml', '<div><script>a &lt; b</script><?p x?></div>', '"cdata-section-elements": xs:QName("style")')
    ).toBe('<div><script>a &lt; b</script><?p x?></div>');
    expect(
      serialized('xhtml', '<div><style>a]]&gt;b</style></div>', '"cdata-section-elements": xs:QName("style")')
    ).toBe('<div><style><![CDATA[a]]]]><![CDATA[>b]]></style></div>');
  });

  it('adds the content type meta element as XML, and writes the XML declaration and XML DOCTYPEs when asked', () => {
    const page = '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head/></h:html>';
    expect(
      serialized('xhtml', page, '"html-version": 1.0, "omit-xml-declaration": false(), "standalone": true()')
    ).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head><h:meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></h:head></h:html>'
    );
    expect(serialized('xhtml', '<html a="&#10;&lt;"/>', '"doctype-public": "p", "doctype-system": "s"')).toBe(
      '<!DOCTYPE html PUBLIC "p" "s"><html a="&#10;&lt;"></html>'
    );
    expect(
      serialized('xhtml', '<html/>', '"doctype-public": "p", "omit-xml-declaration": false(), "standalone": false()')
    ).toBe('<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE html><html></html>');
    expect(serialized('xhtml', '<html/>', '"omit-xml-declaration": false()')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html></html>'
    );
    expect(serializeError('xhtml', '<html/>', '"version": "2.0"')).toBe('SESU0013');
  });

  it('undeclares a default namespace an unprefixed element in no namespace needs', () => {
    expect(serialized('xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><p xmlns=""/></html>', NO_META)).toBe(
      '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><p xmlns=""></p></html>'
    );
  });
});

describe('serialize with the HTML method', () => {
  it('writes atomic values as escaped text, and a newline between top-level nodes when indenting', () => {
    expect(compiler.compile('serialize(("a<b", 1), map { "method": "html" })').evaluateString()).toBe('a&lt;b 1');
    expect(serialized('html', '<!--c--><p/>', '"indent": true()')).toBe('<!--c-->\n<p></p>');
  });
});

describe('the HTML and XHTML methods, as compared with Saxon-JS', () => {
  it('write empty elements in other namespaces with an end tag, which an HTML parser reads as empty', () => {
    expect(serialized('html', '<div><x:e xmlns:x="urn:x"/></div>')).toBe('<div><x:e xmlns:x="urn:x"></x:e></div>');
    expect(serialized('xhtml', '<div><foo/></div>')).toBe('<div><foo></foo></div>');
  });

  it("indent at each element's own depth, the added meta element too", () => {
    expect(
      serialized(
        'html',
        '<html><head/><body><form><b/><select><option/></select></form></body></html>',
        '"indent": true()'
      )
    ).toBe(
      '<!DOCTYPE html>\n<html>\n  <head>\n    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n  </head>\n  <body>\n    <form><b></b><select>\n        <option></option>\n      </select></form>\n  </body>\n</html>'
    );
  });
});

describe('the HTML and XHTML methods, reviewed', () => {
  it('quote DOCTYPE identifiers that hold a double quote with single quotes', () => {
    expect(serialized('html', '<html/>', String.raw`"doctype-system": 'a"b.dtd'`)).toBe(
      `<!DOCTYPE html SYSTEM 'a"b.dtd'><html></html>`
    );
  });

  it('leave URI-escaped attributes out of character maps, as Serialization 3.1 §11 says', () => {
    expect(serialized('html', '<a href="a/b" title="a/b"/>', '"use-character-maps": map { "/": "|" }')).toBe(
      '<a href="a/b" title="a|b"></a>'
    );
  });

  it('escape the attributes of elements in other namespaces as XML, in the HTML method too', () => {
    expect(serialized('html', '<x:a xmlns:x="urn:x" t="a&lt;b&amp;{c}"/>')).toBe(
      '<x:a xmlns:x="urn:x" t="a&lt;b&amp;{c}"></x:a>'
    );
  });

  it('write no HTML5 DOCTYPE after text that comes before the html element', () => {
    const page = compiler.compile('serialize(("x", parse-xml("<html/>")), map { "method": "html" })');
    expect(page.evaluateString()).toBe('x<html></html>');
    const spaced = compiler.compile('serialize((" ", parse-xml("<html/>")), map { "method": "html" })');
    expect(spaced.evaluateString()).toBe(' <!DOCTYPE html><html></html>');
  });

  it('escape the namespace URIs it declares', () => {
    expect(serialized('xhtml', '<x:a xmlns:x="urn:a&amp;&quot;b"/>')).toBe('<x:a xmlns:x="urn:a&amp;&quot;b"></x:a>');
  });
});
