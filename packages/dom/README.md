# @exemplarjs/dom

A W3C DOM Level 3 Core tree for JavaScript, built by the most conformant XML reader there is for the language.

## Why exemplar

The complete XML stack for JavaScript and TypeScript, and the best one. Everything Java developers rely on in StAX, SAX,
DOM and JAXP, plus XPath 3.1, with no dependencies, on Node, Deno, Bun and every modern browser.

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
| [`@exemplarjs/sax`](../sax/README.md)                     | SAX: push handlers, lexical and declaration events, and filter chains                        |
| `@exemplarjs/dom`                                         | A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`                  |
| [`@exemplarjs/xdm`](../xdm/README.md)                     | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](../xpath/README.md)                 | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](../writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md)       | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/dom` is the DOM the JDK's `org.w3c.dom` implements: every node type, entity references and the document
type's entities and notations, attribute types and ID-ness from the DTD, `normalizeDocument()` with `domConfig`, and
base URIs. It passes 1,405 of the 1,532 pages of the W3C DOM Conformance Test Suite; 87 more need XML Schema.
Browser-style `DOMParser` and `XMLSerializer` let code written for browsers run unchanged on Node, Deno and Bun.

It is fast and lean: on an Apple M3 Max it builds trees at up to 314 MB/s, from nodes that keep their fields few.

```bash
npm install @exemplarjs/xml @exemplarjs/writer @exemplarjs/dom
```

### Build a tree

`DocumentBuilder` plays the part of JAXP's: it builds from any source, with every option of the factory you give it, so
validation, DTDs, resolvers, catalogs and XInclude all apply.

```ts
import { DocumentBuilder } from '@exemplarjs/dom';
import { XMLInputFactory } from '@exemplarjs/xml';

const builder = new DocumentBuilder(new XMLInputFactory());
const doc = builder.parse('<library xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Dune</dc:title></library>');

for (const title of doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title'))
  console.log(title.textContent);
doc.documentElement?.setAttribute('checked', 'yes');
```

`await builder.parseAsync(stream)` builds from a stream. The builder adds JAXP's `ignoringComments` and
`ignoringElementContentWhitespace`, and with the factory's `replaceEntityReferences: false` entity references stay in
the tree as read-only nodes holding their expansion.

### Code written for browsers

```ts
import { DOMParser, XMLSerializer } from '@exemplarjs/dom';

const parsed = new DOMParser().parseFromString('<note><to>Ana</to></note>', 'application/xml');
const back = new XMLSerializer().serializeToString(parsed);
```

As in browsers, a document that is not well-formed comes back holding a `parsererror` element instead of throwing. Nodes
have `remove()` beside `removeChild`, and lists answer to `list[i]`, `length`, `item()` and `for...of`.

### Level 3

`doc.normalizeDocument()` does what `doc.domConfig` says: it fixes up namespaces as Appendix B.1 of the recommendation
describes, and, for example, turns CDATA sections into text after `doc.domConfig.setParameter('cdata-sections', false)`.
Where the recommendations leave behaviour open, the tree does what the JDK's does.

To write a tree or any part of it, use `writeNode` on a stream writer from `@exemplarjs/writer`.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
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
