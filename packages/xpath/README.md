# @exemplarjs/xpath

An XPath 3.1 processor for JavaScript, over XDM trees built by the most conformant XML reader there is for the language.

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
| `@exemplarjs/xpath`                                       | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](../writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md)       | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/xpath` is an XPath 3.1 processor over the trees of [`@exemplarjs/xdm`](../xdm/README.md): an
`XPathCompiler` compiles each expression once, and the `XPathExecutable` it gives runs it as often as needed. Values
stay exact inside it: integers of any size and decimals without rounding error.

```bash
npm install @exemplarjs/xml @exemplarjs/xdm @exemplarjs/xpath
```

### Query a tree

```ts
import { XdmDocumentBuilder } from '@exemplarjs/xdm';
import { XMLInputFactory } from '@exemplarjs/xml';
import { XPathCompiler } from '@exemplarjs/xpath';

const doc = new XdmDocumentBuilder(new XMLInputFactory()).parse(
  '<library><book><title>Dune</title><price>12</price></book><book><title>Emma</title><price>8</price></book></library>'
);
const compiler = new XPathCompiler();

compiler.compile('//book[price > 10]/title').evaluateStrings(doc); // ['Dune']
compiler.compile('sum(//price)').evaluateNumber(doc); // 20
```

### Typed variables

Declare the variables an expression uses, by name or with a sequence type, and TypeScript checks that every call gives
each one a value of the right type:

```ts
const cheaper = compiler.compile('//book[price < $max]/title', { variables: { max: 'xs:decimal' } });
cheaper.evaluateStrings(doc, { variables: { max: 10 } }); // ['Emma']
cheaper.evaluateStrings(doc, { variables: { max: 'ten' } }); // a TypeScript error
```

Errors are `XPathException`s with XPath's standard codes, such as `XPST0003` for bad syntax, and a description; errors
found when compiling also give the span of text they were found in and the line and column where it starts.

It runs all of XPath 3.1: paths, predicates, every operator, `for`, `let`, `if`, `some`, `every`, `!`, `=>`, casts,
maps, arrays, lookups, inline functions, function references and partial application. Every function is there: strings,
numbers, sequences, nodes and QNames; dates, times and durations; regular expressions; collations, including the Unicode
Collation Algorithm's through `Intl`; `format-number`, `format-integer` and `format-date`; the higher-order functions
and the `map:` and `array:` functions; JSON through `parse-json`, `json-to-xml`, `xml-to-json` and `json-doc`; `doc`,
`collection`, `unparsed-text` and their kin, reading through your resolvers; `parse-xml`; and `serialize`, with the XML,
XHTML, HTML, text, JSON and adaptive methods.

### Read documents by URI

`doc`, `unparsed-text` and `collection` read through the resolvers an evaluation is given, and nothing is read without
one. A resolver that answers with a promise, such as `fetchResolver`, takes the asynchronous methods, which wait for it:

```ts
import { fetchResolver } from '@exemplarjs/xml/resolvers';

const titles = new XPathCompiler().compile('doc("https://example.org/books.xml")//title');
await titles.evaluateStringsAsync(null, { resources: { uriResolver: fetchResolver() } });
```

### A smaller bundle

`@exemplarjs/xpath/lean` has a compiler with the core functions and the function groups it is given, from
`@exemplarjs/xpath/groups/`, so that a bundle carries only those; `compileAsync` loads the groups an expression calls.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
- [`@exemplarjs/dom`](../dom/README.md): A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`
- [`@exemplarjs/xdm`](../xdm/README.md): An XDM 3.1 tree, the data model of XPath, XQuery and XSLT
- [`@exemplarjs/writer`](../writer/README.md): Stream and event writers, to strings, bytes and web streams
- [`@exemplarjs/validation`](../validation/README.md): Validation against a DTD
- [`@exemplarjs/catalog`](../catalog/README.md): OASIS XML Catalogs 1.1
- [`@exemplarjs/xinclude`](../xinclude/README.md): XInclude 1.0, with XPointer
- [`@exemplarjs/canonical`](../canonical/README.md): Canonical XML 1.0 and 1.1, and Exclusive Canonicalization
- [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md): Japanese, Chinese and Korean encodings

The [documentation](https://exemplar.l47.net) shows every part at work through common tasks, with a reference for the
details.

## License

Apache License 2.0. The decoding tables derive from Unicode, ICU and WHATWG data, whose licences and attributions ship
in `THIRD_PARTY_LICENSES`.
