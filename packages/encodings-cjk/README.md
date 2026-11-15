# @exemplarjs/encodings-cjk

Japanese, Chinese and Korean encodings for exemplar, decoded as the JDK decodes them.

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

| Package                                             | What it adds                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`@exemplarjs/xml`](../xml/README.md)               | The reader: pull cursor, event objects, async streams, DTDs, entities, resolvers and filters |
| [`@exemplarjs/sax`](../sax/README.md)               | SAX: push handlers, lexical and declaration events, and filter chains                        |
| [`@exemplarjs/dom`](../dom/README.md)               | A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`                  |
| [`@exemplarjs/xdm`](../xdm/README.md)               | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](../xpath/README.md)           | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](../writer/README.md)         | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md) | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)       | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)     | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)   | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| `@exemplarjs/encodings-cjk`                         | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/encodings-cjk` adds the double-byte and stateful encodings of East Asia to `@exemplarjs/xml`: documents in
them are detected from their XML declaration and decoded in chunks of any size, down to a byte at a time, like any
built-in encoding. The tables load only when you import the package, so readers that never meet these encodings never
pay for them.

| Language | Encodings                                   |
| -------- | ------------------------------------------- |
| Japanese | Shift_JIS, windows-31j, EUC-JP, ISO-2022-JP |
| Chinese  | GBK, GB2312, Big5, Big5-HKSCS               |
| Korean   | EUC-KR                                      |

GB18030, UTF-8, UTF-16, UTF-32 and the single-byte encodings are built into `@exemplarjs/xml` itself.

```bash
npm install @exemplarjs/xml @exemplarjs/encodings-cjk
```

### Register the decoders

```ts
import { cjkDecoders } from '@exemplarjs/encodings-cjk';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';

const xml = new XMLInputFactory({ decoders: cjkDecoders });

// <?xml version="1.0" encoding="Shift_JIS"?><r>日本</r>
const bytes = Uint8Array.from([
  ...new TextEncoder().encode('<?xml version="1.0" encoding="Shift_JIS"?><r>'),
  0x93,
  0xfa,
  0x96,
  0x7b,
  ...new TextEncoder().encode('</r>'),
]);
const reader = xml.createStreamReader(bytes);
while (reader.next() !== EventType.END_DOCUMENT)
  if (reader.eventType() === EventType.CHARACTERS) console.log(reader.text());
```

Bytes that are illegal in their encoding are a fatal error, `ENCODING_INVALID_BYTES`, at the place they occur, as the
XML specification requires.

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
- [`@exemplarjs/canonical`](../canonical/README.md): Canonical XML 1.0 and 1.1, and Exclusive Canonicalization

The [documentation](https://github.com/io-timeout/exemplar-docs) shows every part at work through common tasks, with a
reference for the details.

## License

Apache License 2.0. The decoding tables derive from Unicode, ICU and WHATWG data, whose licences and attributions ship
in `THIRD_PARTY_LICENSES`.
