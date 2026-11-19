# @exemplarjs/canonical

Canonical XML for JavaScript: C14N 1.0 and 1.1 and Exclusive Canonicalization, for signatures and comparisons.

## Why exemplar

The complete XML stack for JavaScript and TypeScript, and the best one. Everything Java developers rely on in StAX, SAX,
DOM and JAXP, plus XPath 3.1, with no dependencies, on Node, Bun and every modern browser.

- **The most conformant.** Nothing in JavaScript passes more of the
  [W3C conformance suites](https://exemplar.l47.net/reference/conformance), for XML or for XPath.
- **The fastest.** Ahead of every other JavaScript XML library in
  [the benchmarks](https://exemplar.l47.net/benchmarks/), for reading, building trees, querying and writing, with every
  check left on.
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
| [`@exemplarjs/dom`](../dom/README.md)                     | A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`                  |
| [`@exemplarjs/xdm`](../xdm/README.md)                     | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](../xpath/README.md)                 | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](../writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md)       | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| `@exemplarjs/canonical`                                   | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/canonical` writes the canonical form of a document or of a DOM subset, byte for byte as the recommendations
define it: Canonical XML 1.0 and 1.1, with and without comments, and Exclusive XML Canonicalization 1.0 with inclusive
namespace prefixes. Because canonicalization needs the document as a validating processor sees it, it reads the whole
DTD, applies attribute defaults and expands entities, through the resolvers you give it, so the form it writes is
exactly the one the recommendations define.

```bash
npm install @exemplarjs/xml @exemplarjs/dom @exemplarjs/writer @exemplarjs/canonical
```

### Canonicalize

```ts
import { canonicalize } from '@exemplarjs/canonical';

const text = canonicalize('<doc b="2"   a="1"><e/></doc>', { method: 'c14n11' });
// <doc a="1" b="2"><e></e></doc>
```

`canonicalize` takes a source, a reader or a `StreamReaderDelegate` over one, or a DOM node, and returns a string or,
with `output: 'bytes'`, UTF-8 bytes. A DOM node is canonicalized as a document subset, carrying its ancestors'
namespaces and `xml:` attributes as each method says:

```ts
import { DocumentBuilder } from '@exemplarjs/dom';
import { XMLInputFactory } from '@exemplarjs/xml';

const factory = new XMLInputFactory();
const signed = new DocumentBuilder(factory).parse(
  '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo Id="si"/></ds:Signature>'
);
const signedInfo = signed.documentElement?.firstChild;
if (signedInfo) {
  const bytes = canonicalize(signedInfo, { method: 'exc-c14n', inclusivePrefixes: ['ds'], output: 'bytes' });
}
```

### Methods

| `method`                          | Form                                                                |
| --------------------------------- | ------------------------------------------------------------------- |
| `'c14n'` (the default)            | Canonical XML 1.0                                                   |
| `'c14n11'`                        | Canonical XML 1.1                                                   |
| `'exc-c14n'`                      | Exclusive XML Canonicalization 1.0, with `inclusivePrefixes`        |
| `'suite-first'`, `'suite-second'` | The W3C XML Test Suite's own canonical forms, for comparing parsers |

Each takes `comments: true` or `false`. Pass a `factory` to read the DTD and external entities through your resolvers
and catalog.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
- [`@exemplarjs/dom`](../dom/README.md): A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`
- [`@exemplarjs/xdm`](../xdm/README.md): An XDM 3.1 tree, the data model of XPath, XQuery and XSLT
- [`@exemplarjs/xpath`](../xpath/README.md): An XPath 3.1 processor over XDM trees
- [`@exemplarjs/writer`](../writer/README.md): Stream and event writers, to strings, bytes and web streams
- [`@exemplarjs/validation`](../validation/README.md): Validation against a DTD
- [`@exemplarjs/catalog`](../catalog/README.md): OASIS XML Catalogs 1.1
- [`@exemplarjs/xinclude`](../xinclude/README.md): XInclude 1.0, with XPointer
- [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md): Japanese, Chinese and Korean encodings

The [documentation](https://exemplar.l47.net) shows every part at work through common tasks, with a reference for the
details.

## License

Apache License 2.0. The decoding tables derive from Unicode, ICU and WHATWG data, whose licences and attributions ship
in `THIRD_PARTY_LICENSES`.
