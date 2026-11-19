# @exemplarjs/xdm

An XDM 3.1 tree for JavaScript, the data model XPath, XQuery and XSLT work on, built by the most conformant XML reader
there is for the language.

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
| `@exemplarjs/xdm`                                         | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](../xpath/README.md)                 | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](../writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md)       | Validation against a DTD                                                                     |
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/xdm` builds the trees of the XQuery and XPath Data Model 3.1 from any source the reader takes, as `XdmNode`
s. It follows the data model's construction from an Infoset: entities are expanded, CDATA sections and adjacent text
become one text node, attributes keep whether the DTD or `xml:id` makes them IDs or ID references, and the DTD's
unparsed entities stay with the document. Every accessor the data model defines is there: `nodeName`, `stringValue`,
`parent`, `baseURI` by XML Base, `documentURI`, `isId`, `isIdrefs`, `nilled`, `typeName`, children, attributes and
namespace nodes.

It also holds the data model's atomic values: strings, booleans, numbers, dates, times, durations and the rest, with
integers of any size, exact decimals and exact fractions of a second, cast, compared and computed with as XPath's
functions and operators define. Dates and times are `XMLGregorianCalendar`s and durations `Duration`s, immutable classes
named as in `javax.xml.datatype`. Maps and arrays are `XdmMap`s and `XdmArray`s, immutable too, and with the functions
XPath makes they are `XdmFunction`s; map keys compare as XPath's `op:same-key` does, so `1`, `1.0` and `1e0` are one
key.

The tree is compact: it holds its nodes in typed arrays in document order and all its text in one string, so it takes a
fraction of the memory of a DOM tree, and walking it is arithmetic on numbers.

```bash
npm install @exemplarjs/xml @exemplarjs/xdm
```

### Build a tree

```ts
import { XdmDocumentBuilder } from '@exemplarjs/xdm';
import { XMLInputFactory } from '@exemplarjs/xml';

const builder = new XdmDocumentBuilder(new XMLInputFactory());
const doc = builder.parse('<library><book xml:id="b1"><title>Dune</title></book></library>');

doc.stringValue; // 'Dune'
doc.elementById('b1')?.nodeName?.localName; // 'book'
```

`await builder.parseAsync(stream)` builds from a stream. The factory's options apply, so validation, DTDs, resolvers,
catalogs and XInclude all do; documents are always read with namespaces and with entity references expanded, as the data
model asks.

### Walk it

Every axis of XPath is there, in its order: document order for the forward axes, nearest first for the reverse ones. A
node test keeps nodes by kind and name.

```ts
import { Axis, NodeKind } from '@exemplarjs/xdm';

const title = { kind: NodeKind.ELEMENT, name: doc.tree.names.lookup('', 'title') };
for (const node of doc.axis(Axis.DESCENDANT, title)) console.log(node.stringValue);
```

An `XdmNode` is a small view of one node of a `Tree`. Code that walks many nodes, such as an XPath engine, can work on
the tree's node numbers instead, with `axisIterator(tree, node, axis, test)`, and make views only of the nodes it
returns.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
- [`@exemplarjs/dom`](../dom/README.md): A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`
- [`@exemplarjs/xpath`](../xpath/README.md): An XPath 3.1 processor over XDM trees
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
