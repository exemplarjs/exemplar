# @exemplarjs/writer

XML stream and event writers for JavaScript: round-trip safe, well-formed by construction, and fast.

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
| [`@exemplarjs/sax`](../sax/README.md)                     | SAX: push handlers, lexical and declaration events, and filter chains                        |
| [`@exemplarjs/dom`](../dom/README.md)                     | A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`                  |
| [`@exemplarjs/xdm`](../xdm/README.md)                     | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](../xpath/README.md)                 | An XPath 3.1 processor over XDM trees                                                        |
| `@exemplarjs/writer`                                      | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md)       | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/writer` has StAX's two writers: a stream writer like `XMLStreamWriter`, and an event writer like
`XMLEventWriter` that takes the events `@exemplarjs/xml` reads, so a filtering copy is a loop. It escapes so that
re-reading gives back exactly what was written, refuses anything that would not be well-formed, repairs namespaces when
asked, indents as the XSLT serialization rules require, with the character maps and suppressed indentation serializers
need, and writes strings, bytes in any built-in encoding, or a web `WritableStream`.

```bash
npm install @exemplarjs/xml @exemplarjs/writer
```

### Write a document

```ts
import { StringSink, XMLOutputFactory } from '@exemplarjs/writer';

const out = new XMLOutputFactory({ indent: '  ' });
const sink = new StringSink();
const w = out.createStreamWriter(sink);
const DC = 'http://purl.org/dc/elements/1.1/';

w.writeStartDocument();
w.writeStartElement('library');
w.writeNamespace('dc', DC);
w.writeStartElement('dc', 'title', DC);
w.writeAttribute('lang', 'en');
w.writeCharacters('Dune & Children');
w.writeEndElement();
w.writeEndElement();
w.writeEndDocument();
w.flush();

console.log(sink.toString());
```

Names can also be a `QName` from `@exemplarjs/xml`, which avoids StAX's differing argument orders for elements and
attributes.

### Copy and transform

`copy` writes what a reader reads, from where it stands: a whole document, or the element at its start tag, which can go
inside a document being written. The reader can be filtered or a delegate, so what they change is what is written.
`copyAsync` does the same for a reader that waits for its input, and lets a slow destination catch up as it goes.

```ts
import { XMLInputFactory } from '@exemplarjs/xml';

const copied = new StringSink();
const w = out.createStreamWriter(copied);
w.copy(new XMLInputFactory().createStreamReader('<a><b>keep</b></a>'));
w.flush();
```

With event objects, a copy that changes events is a loop:

```ts
import { EventType, XMLInputFactory } from '@exemplarjs/xml';

const copy = new StringSink();
const writer = out.createEventWriter(copy);
for (const event of new XMLInputFactory().createEventReader('<a><!-- drop me --><b>keep</b></a>')) {
  if (event.type !== EventType.COMMENT) writer.add(event);
}
writer.flush();
```

### Streams and encodings

Give a web `WritableStream` and an encoding to write a file or a response. The writes return at once, so await `drain()`
now and then to keep a slow stream from queuing the whole document, and `close()` at the end. Bytes can be UTF-8, UTF-16
in either byte order, or any single-byte encoding the reader decodes; characters an encoding lacks become character
references.

### What the writer guarantees

- Round-trip escaping by default, tabs and line breaks in attribute values included, or minimal escaping on request.
- Names, characters, nesting, one root, duplicate attributes and prefix bindings checked as you write.
- Namespace declarations written as given, or added where needed with `repairNamespaces: true`.
- XML 1.0 or 1.1, a DOCTYPE, CDATA-section elements and the XML declaration under the options JAXP's serializer has. The
  declaration is written on a line of its own.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
- [`@exemplarjs/dom`](../dom/README.md): A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`
- [`@exemplarjs/xdm`](../xdm/README.md): An XDM 3.1 tree, the data model of XPath, XQuery and XSLT
- [`@exemplarjs/xpath`](../xpath/README.md): An XPath 3.1 processor over XDM trees
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
