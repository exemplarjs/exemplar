[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=io-timeout_exemplar&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=io-timeout_exemplar)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=io-timeout_exemplar&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=io-timeout_exemplar)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=io-timeout_exemplar&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=io-timeout_exemplar)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=io-timeout_exemplar&metric=coverage)](https://sonarcloud.io/summary/new_code?id=io-timeout_exemplar)

# exemplar

The most conformant XML stack for JavaScript, and the fastest pure-JavaScript one: pull, push and event readers, DOM and
XDM trees, XPath 3.1, writers, DTD validation, XInclude, catalogs and canonical XML.

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

| Package                                                         | What it adds                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`@exemplarjs/xml`](packages/xml/README.md)                     | The reader: pull cursor, event objects, async streams, DTDs, entities, resolvers and filters |
| [`@exemplarjs/sax`](packages/sax/README.md)                     | SAX: push handlers, lexical and declaration events, and filter chains                        |
| [`@exemplarjs/dom`](packages/dom/README.md)                     | A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`                  |
| [`@exemplarjs/xdm`](packages/xdm/README.md)                     | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](packages/xpath/README.md)                 | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](packages/writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](packages/validation/README.md)       | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](packages/catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](packages/xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](packages/canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](packages/encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## Documentation

- [exemplar-docs](https://github.com/io-timeout/exemplar-docs): how to use exemplar, through common tasks, with a
  reference for the details.
- [examples](examples): worked examples, from reading a file to processing a large one record at a time, each tested
  against its expected result.
- [docs/design.md](docs/design.md): how exemplar is built, and why.
- [docs/development.md](docs/development.md): the workspace, its commands and conventions, and how to measure a change.
- [docs/testing.md](docs/testing.md): the unit and property tests, and where the suites and benchmarks run.

## License

Apache License 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). The decoding tables derive from Unicode, ICU and WHATWG
data, whose licences and attributions are in [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES). Every package ships all
three.
