# @exemplarjs/xml

The XML reader at the heart of exemplar: fast, W3C-conformant, and DTD-aware.

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
| `@exemplarjs/xml`                                         | The reader: pull cursor, event objects, async streams, DTDs, entities, resolvers and filters |
| [`@exemplarjs/sax`](../sax/README.md)                     | SAX: push handlers, lexical and declaration events, and filter chains                        |
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

`@exemplarjs/xml` reads XML in the three styles Java offers: a pull cursor like StAX's `XMLStreamReader`, event objects
like StAX's `XMLEventReader`, and the foundation the push, tree and writer packages build on. It reads DTDs, expands
entities, resolves external DTDs and entities through resolvers you control, and checks everything the XML
recommendation asks a parser to check.

```bash
npm install @exemplarjs/xml
```

### Read with the cursor

```ts
import { EventType, XMLInputFactory } from '@exemplarjs/xml';

const xml = new XMLInputFactory();
const reader = xml.createStreamReader('<book id="b1"><title>Dune</title></book>');

for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
  if (type === EventType.START_ELEMENT) console.log(reader.localName(), reader.attribute('id'));
  else if (type === EventType.CHARACTERS) console.log(reader.text());
}
```

`attribute(localName)` finds an attribute by name, and `attribute(localName, namespaceURI)` one in a namespace, where
StAX has `getAttributeValue(namespaceURI, localName)`. `attributeCount()` and `attributeName(i)`, `attributeValue(i)`
and the like walk them all by position.

A source can be a string, a `Uint8Array`, an iterable or async iterable of chunks, a `ReadableStream`, or an object that
adds a `systemId`, `publicId`, `baseURI` or `encoding`. Bytes are decoded as the XML specification says: byte-order
mark, outside encoding, then the XML declaration.

### Read large files and streams

The async reader returns events at once while input is buffered and waits only between chunks, so a stream costs a
promise per chunk, not per event:

```ts
const stream = new Blob(['<log>', '<entry level="warn">disk</entry>'.repeat(3), '</log>']).stream();
const levels: string[] = [];

await xml.createAsyncStreamReader(stream).forEachEvent((type, r) => {
  if (type === EventType.START_ELEMENT && r.localName() === 'entry') levels.push(r.attribute('level') ?? '');
});
```

For data that arrives in pieces you don't control, such as socket messages, create the reader without a source and
`feed()` it.

### Read events as objects

```ts
for (const event of xml.createEventReader('<a><b>text</b></a>')) {
  if (event.type === EventType.START_ELEMENT) console.log(event.name.localName);
}
```

### DTDs, entities and resolvers

Internal subsets are read and applied: entities expand, attribute defaults appear, and declared types normalize values.
External DTDs and entities come through a resolver, and only for the protocols the access lists allow:

```ts
const dtds: Record<string, string> = {
  'http://example.com/book.dtd': '<!ENTITY publisher "ACME"><!ATTLIST book lang CDATA "en">',
};
const factory = new XMLInputFactory({
  entityResolver: { resolveEntity: ({ systemId = '' }) => ({ systemId, text: dtds[systemId] ?? '' }) },
});
const book = factory.createStreamReader('<!DOCTYPE book SYSTEM "http://example.com/book.dtd"><book>&publisher;</book>');

for (let type = book.next(); type !== EventType.END_DOCUMENT; type = book.next()) {
  if (type === EventType.START_ELEMENT) console.log(book.attribute('lang')); // en, defaulted by the DTD
  else if (type === EventType.CHARACTERS) console.log(book.text()); // ACME, from the DTD's entity
}
```

`fileResolver({ root })` from `@exemplarjs/xml/resolvers/file` reads files below a root on Node and Bun, and
`fetchResolver()` from `@exemplarjs/xml/resolvers` reads over HTTP in async readers.

### Filters

`createFilteredReader` from `@exemplarjs/xml/filters` passes on only the events a function accepts. It runs inside the
reader's own `next()`, so filtering costs almost nothing. Give it several filters and they run in order, each seeing
only what those before it accepted:

```ts
const reader = createFilteredReader(factory.createStreamReader(xml), withoutDrafts, withoutComments);
```

To change what a reader reports rather than drop it, subclass `StreamReaderDelegate` and override the calls to change.
`createDelegatedReader` stacks delegates on a reader, each reading through the one before it:

```ts
const reader = createDelegatedReader(factory.createStreamReader(xml), new MaskedCards(), new RenamedCustomers());
```

### Untrusted and trusted input

The defaults are safe: no external access, and the entity-expansion limits of JDK 24. Refuse DTDs outright, or tighten a
limit, for input from strangers:

```ts
const untrusted = new XMLInputFactory({ disallowDoctype: true, limits: { elementDepth: 64 } });
```

Every error is an `XMLError` with a stable `code`, a line, a column, an offset and a system id.

## Conformance

| Suite                      | Result                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| XML Conformance Test Suite | 6,813 of 6,816 applicable tests pass, under `standalone`, `external` and `validating`; 3 catalogue anomalies are listed       |
| DOM Conformance Test Suite | 1,405 of 1,532 test pages pass; 87 need XML Schema, and 40 are listed with reasons                                            |
| XInclude Test Suite        | 151 of 153 applicable tests pass; 21 need `xpointer()`, a live server, or an unexpanded entity, and 2 are listed with reasons |
| `xml:id` Test Suite        | 11 of 13 pass; 2 need XML Schema                                                                                              |
| Canonical XML              | The recommendations' examples that need no XPath pass under C14N 1.0 and 1.1                                                  |
| XML Catalogs               | Agrees with `javax.xml.catalog` but where the JDK departs from the OASIS specification                                        |

The XML suite also runs on Bun, and in Chromium, Firefox and WebKit.

## Performance

On an Apple M3 Max with Node 24, reading every name, attribute and text, building a tree, and writing events back out:

| Dataset                                  | `read`   | `tree`                | `write`  |
| ---------------------------------------- | -------- | --------------------- | -------- |
| FreeBSD documentation, entities expanded | 211 MB/s | 122 MB/s, 313 MB held | 172 MB/s |
| PostgreSQL documentation                 | 542 MB/s | 314 MB/s, 15 MB held  | 551 MB/s |
| OpenStack manuals                        | 190 MB/s | 114 MB/s, 46 MB held  | 139 MB/s |
| XMark, factors 0.1 and 1                 | 273 MB/s | 126 MB/s, 715 MB held | 237 MB/s |

The [benchmarks](https://github.com/io-timeout/exemplar-tests/blob/main/docs/benchmarking.md) also run nightly on a
fixed Linux machine, on documents as published: internal subsets, entity references, eight encodings and all.

## See also

- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
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
