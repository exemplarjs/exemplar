# @exemplarjs/validation

DTD validation for JavaScript: every validity constraint of XML 1.0 and 1.1, checked as you read.

## Why exemplar

The complete XML stack for JavaScript and TypeScript, and the best one. Everything Java developers rely on in StAX, SAX,
DOM and JAXP, plus XPath 3.1, with no dependencies, on Node, Bun and every modern browser.

- **The most conformant.** Nothing in JavaScript passes more of the
  [W3C conformance suites](https://github.com/exemplarjs/exemplar-tests/blob/main/docs/testing.md), for XML or for
  XPath.
- **The fastest.** Ahead of every other JavaScript XML library in
  [the benchmarks](https://github.com/exemplarjs/exemplar-tests/blob/main/docs/benchmarking.md), for reading, building
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
| [`@exemplarjs/writer`](../writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| `@exemplarjs/validation`                                  | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/validation` turns `@exemplarjs/xml` into a validating processor. Give its validator to a factory and every
reader made from it, cursor, events, SAX and DOM alike, checks the document against its DTD as it reads: content models,
attribute types and defaults, ID, IDREF and IDREFS, ENTITY and NOTATION attributes, the `standalone` rules, and the
declarations themselves. It is checked against the W3C XML Conformance Test Suite's valid and invalid documents on every
change.

exemplar is the only pure-JavaScript XML library that validates against a DTD.

```bash
npm install @exemplarjs/xml @exemplarjs/validation
```

### Validate

```ts
import { dtdValidator } from '@exemplarjs/validation';
import { EventType, type XMLError, XMLInputFactory } from '@exemplarjs/xml';

const problems: XMLError[] = [];
const validating = new XMLInputFactory({
  validator: dtdValidator(),
  errorHandler: { error: (e) => problems.push(e) }, // validity errors; well-formedness errors still throw
});

const doc = `<!DOCTYPE order [
  <!ELEMENT order (item+)>
  <!ELEMENT item (#PCDATA)>
  <!ATTLIST item sku ID #REQUIRED>
]><order><item sku="a1">Tea</item><item>Milk</item></order>`;

const reader = validating.createStreamReader(doc);
while (reader.next() !== EventType.END_DOCUMENT);
console.log(problems.map((e) => `${e.code} at ${e.line}:${e.column}`)); // [ 'VC_REQUIRED_ATTRIBUTE at 5:35' ]
```

Without an `error` handler, the first validity error throws and ends the document. Each error carries a `VC_` code that
names the constraint, with its line, column and system id.

### External DTDs

Validation reads the external subset and parameter entities through the factory's resolvers, `fileResolver` and
`fetchResolver` included, or through an XML catalog from `@exemplarjs/catalog`, and only for the protocols
`accessExternalDTD` allows.

### What it checks

- Content models, compiled to deterministic automata as children arrive.
- Attribute types, enumerations, `#REQUIRED` and `#FIXED`, and defaults that fit their types.
- Unique IDs and IDREFs that point at one, checked once the document ends.
- Unique element types and notations, one ID attribute per element, `xml:space` declared as XML says, and declarations
  that start and end in the same parameter entity.
- Under namespaces, no colons in ID, IDREF, ENTITY and NOTATION values.

The validator also marks whitespace in element content, which the readers report as ignorable whitespace.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
- [`@exemplarjs/dom`](../dom/README.md): A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`
- [`@exemplarjs/xdm`](../xdm/README.md): An XDM 3.1 tree, the data model of XPath, XQuery and XSLT
- [`@exemplarjs/xpath`](../xpath/README.md): An XPath 3.1 processor over XDM trees
- [`@exemplarjs/writer`](../writer/README.md): Stream and event writers, to strings, bytes and web streams
- [`@exemplarjs/catalog`](../catalog/README.md): OASIS XML Catalogs 1.1
- [`@exemplarjs/xinclude`](../xinclude/README.md): XInclude 1.0, with XPointer
- [`@exemplarjs/canonical`](../canonical/README.md): Canonical XML 1.0 and 1.1, and Exclusive Canonicalization
- [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md): Japanese, Chinese and Korean encodings

The [documentation](https://exemplar.l47.net) shows every part at work through common tasks, with a reference for the
details.

## License

Apache License 2.0. The decoding tables derive from Unicode, ICU and WHATWG data, whose licences and attributions ship
in `THIRD_PARTY_LICENSES`.
