# @exemplarjs/sax

SAX for JavaScript: push handlers on the most conformant XML reader in JavaScript, and the fastest pure-JavaScript one.

## Why exemplar

The complete XML stack for JavaScript and TypeScript, and the best one. Everything Java developers rely on in StAX, SAX,
DOM and JAXP, plus XPath 3.1, with no dependencies, on Node, Bun and every modern browser.

- **The most conformant.** Nothing in JavaScript passes more of the
  [W3C conformance suites](https://github.com/io-timeout/exemplar-tests/blob/main/docs/testing.md), for XML or for
  XPath.
- **The fastest.** Ahead of every other JavaScript XML library in
  [the benchmarks](https://github.com/io-timeout/exemplar-tests/blob/main/docs/benchmarking.md), for reading, building
  trees, querying and writing, with every check left on.
- **The best XPath in JavaScript.** A complete XPath 3.1 processor, compiled for speed, with typed variables your editor
  checks.
- **Every standard that matters.** Full DTD support and validation, namespaces, XML 1.1, XInclude, catalogs, Canonical
  XML and DOM Level 3 Core, where other libraries stop at the basics.
- **Built for real-world data.** Any stream, any chunk size, any encoding, synchronous or asynchronous, from a string in
  memory to gigabytes over the network.
- **Safe by default.** Nothing external is read unless you allow it, and hostile documents hit hard limits.
- **Small where it counts.** Import only what you use; everything else stays out of your bundle.
- **Typed and tested.** Written in TypeScript, with thousands of tests at full coverage and extensive testing against
  the W3C conformance suites.

## The packages

Every package builds on `@exemplarjs/xml` and is released at the same version, so pick the parts you need:

| Package                                                   | What it adds                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`@exemplarjs/xml`](../xml/README.md)                     | The reader: pull cursor, event objects, async streams, DTDs, entities, resolvers and filters |
| `@exemplarjs/sax`                                         | SAX: push handlers, lexical and declaration events, and filter chains                        |
| [`@exemplarjs/dom`](../dom/README.md)                     | A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`                  |
| [`@exemplarjs/xdm`](../xdm/README.md)                     | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](../xpath/README.md)                 | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](../writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md)       | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/sax` is SAX2 as Java has it: content, lexical, declaration, DTD and error events on one handler object, an
`Attributes` view, a locator, and `XMLFilterImpl` chains. It reads through `@exemplarjs/xml`, so every option, resolver,
catalog, validator and XInclude processor you give its factory applies, and it runs within a few percent of the pull
cursor's speed.

```bash
npm install @exemplarjs/xml @exemplarjs/sax
```

### Handle events

A handler implements only the methods it needs:

```ts
import { SAXParser, type Attributes } from '@exemplarjs/sax';
import { XMLInputFactory } from '@exemplarjs/xml';

const parser = new SAXParser(new XMLInputFactory());
const titles: string[] = [];
let inTitle = false;

parser.parse('<books><book><title>Dune</title></book></books>', {
  startElement(uri: string, localName: string, qName: string, attributes: Attributes) {
    inTitle = localName === 'title';
  },
  characters(text: string) {
    if (inTitle) titles.push(text);
  },
  endElement() {
    inTitle = false;
  },
  comment(text: string) {}, // lexical events, as in SAX's LexicalHandler
});
```

`parseAsync(stream, handler)` reads streams and async iterables the same way. `Attributes` reads by index, by qualified
name, or by namespace URI and local name, and gives each attribute's DTD type and whether it was specified or defaulted.

### Everything SAX reports

- `startDTD`, `endDTD`, `startEntity`, `endEntity`, `startCDATA`, `endCDATA` and `comment`, as `LexicalHandler` does;
- `elementDecl`, `attributeDecl`, `internalEntityDecl`, `externalEntityDecl`, `notationDecl` and `unparsedEntityDecl`,
  as `DeclHandler` and `DTDHandler` do;
- `skippedEntity` for entities that are not read, `ignorableWhitespace` when validating, and `startPrefixMapping` and
  `endPrefixMapping` around elements;
- `warning`, `error` and `fatalError`, with a locator that gives the error's position while they run.

### Filter chains

```ts
import { XMLFilterImpl } from '@exemplarjs/sax';

class RenamePara extends XMLFilterImpl {
  override startElement(uri: string, localName: string, qName: string, attributes: Attributes) {
    super.startElement(uri, localName === 'para' ? 'p' : localName, qName, attributes);
  }
}

parser.parse('<doc><para>Hello</para></doc>', new RenamePara({ startElement: (u, local) => console.log(local) }));
```

The factory's options cover SAX's features, such as `namespaceAware` for `namespaces`; the parser adds `resolveDTDURIs`
and `xmlnsURIs` for the two that no factory option covers.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/dom`](../dom/README.md): A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`
- [`@exemplarjs/xdm`](../xdm/README.md): An XDM 3.1 tree, the data model of XPath, XQuery and XSLT
- [`@exemplarjs/xpath`](../xpath/README.md): An XPath 3.1 processor over XDM trees
- [`@exemplarjs/writer`](../writer/README.md): Stream and event writers, to strings, bytes and web streams
- [`@exemplarjs/validation`](../validation/README.md): Validation against a DTD
- [`@exemplarjs/catalog`](../catalog/README.md): OASIS XML Catalogs 1.1
- [`@exemplarjs/xinclude`](../xinclude/README.md): XInclude 1.0, with XPointer
- [`@exemplarjs/canonical`](../canonical/README.md): Canonical XML 1.0 and 1.1, and Exclusive Canonicalization
- [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md): Japanese, Chinese and Korean encodings

The [documentation](https://github.com/io-timeout/exemplar-docs) shows every part at work through common tasks, with a
reference for the details.

## License

Apache License 2.0. The decoding tables derive from Unicode, ICU and WHATWG data, whose licences and attributions ship
in `THIRD_PARTY_LICENSES`.
