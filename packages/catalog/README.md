# @exemplarjs/catalog

OASIS XML Catalogs 1.1 for JavaScript: local copies of DTDs, entities and XInclude targets, resolved the way Java
resolves them.

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
| [`@exemplarjs/dom`](../dom/README.md)                     | A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`                  |
| [`@exemplarjs/xdm`](../xdm/README.md)                     | An XDM 3.1 tree, the data model of XPath, XQuery and XSLT                                    |
| [`@exemplarjs/xpath`](../xpath/README.md)                 | An XPath 3.1 processor over XDM trees                                                        |
| [`@exemplarjs/writer`](../writer/README.md)               | Stream and event writers, to strings, bytes and web streams                                  |
| [`@exemplarjs/validation`](../validation/README.md)       | Validation against a DTD                                                                     |
| `@exemplarjs/catalog`                                     | OASIS XML Catalogs 1.1                                                                       |
| [`@exemplarjs/xinclude`](../xinclude/README.md)           | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/catalog` maps public and system identifiers and URIs to local copies, so documents that name DTDs and
entities on the web read from your disk instead, offline and fast. It implements every entry type of OASIS XML Catalogs
1.1 and follows `javax.xml.catalog`'s configuration, and the differential tests compare it with the JDK on every entry
type and matching rule.

exemplar is the only pure-JavaScript XML library with XML Catalogs.

```bash
npm install @exemplarjs/xml @exemplarjs/catalog
```

### Use a catalog

```ts
import { catalogResolver } from '@exemplarjs/catalog';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';

const catalogs: Record<string, string> = {
  'file:///opt/schemas/catalog.xml': `<catalog xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog">
    <public publicId="-//ACME//DTD Order//EN" uri="order.dtd"/>
  </catalog>`,
  'file:///opt/schemas/order.dtd': '<!ENTITY shop "ACME Tea">',
};

const xml = new XMLInputFactory({
  accessExternalDTD: ['file'],
  catalog: catalogResolver({
    files: ['file:///opt/schemas/catalog.xml'],
    read: (uri) => (catalogs[uri] === undefined ? undefined : { systemId: uri, text: catalogs[uri] }),
  }),
});

const reader = xml.createStreamReader(
  '<!DOCTYPE order PUBLIC "-//ACME//DTD Order//EN" "http://acme.example/order.dtd"><order>&shop;</order>'
);
while (reader.next() !== EventType.END_DOCUMENT)
  if (reader.eventType() === EventType.CHARACTERS) console.log(reader.text()); // ACME Tea
```

On Node, Deno and Bun the catalog reads local `file:` URIs itself, so `read` is needed only elsewhere, or to serve
catalogs from memory as above. The access lists apply to the URI the catalog maps to, so a catalog that maps `http:`
identifiers to `file:` copies needs only `'file'`.

### Everything the specification has

- `public`, `system`, `rewriteSystem`, `systemSuffix`, `delegatePublic` and `delegateSystem` for DTDs and entities;
- `uri`, `rewriteURI`, `uriSuffix` and `delegateURI` for XInclude targets and other URIs;
- `nextCatalog`, `group`, `prefer`, `xml:base` and `urn:publicid:` unwrapping.

`files`, `prefer`, `defer` and `resolution` follow `javax.xml.catalog`: under the default `resolution: 'strict'` an
identifier the catalog doesn't know is an error, `'continue'` carries on as if there were no catalog, and `'ignore'`
resolves an entity to empty content. The catalog is asked after your own resolvers, as in the JDK, and serves validation
in `@exemplarjs/validation` and inclusions in `@exemplarjs/xinclude` alike.

## See also

- [`@exemplarjs/xml`](../xml/README.md): The reader: pull cursor, event objects, async streams, DTDs, entities,
  resolvers and filters
- [`@exemplarjs/sax`](../sax/README.md): SAX: push handlers, lexical and declaration events, and filter chains
- [`@exemplarjs/dom`](../dom/README.md): A DOM Level 3 Core tree, with browser-style `DOMParser` and `XMLSerializer`
- [`@exemplarjs/xdm`](../xdm/README.md): An XDM 3.1 tree, the data model of XPath, XQuery and XSLT
- [`@exemplarjs/xpath`](../xpath/README.md): An XPath 3.1 processor over XDM trees
- [`@exemplarjs/writer`](../writer/README.md): Stream and event writers, to strings, bytes and web streams
- [`@exemplarjs/validation`](../validation/README.md): Validation against a DTD
- [`@exemplarjs/xinclude`](../xinclude/README.md): XInclude 1.0, with XPointer
- [`@exemplarjs/canonical`](../canonical/README.md): Canonical XML 1.0 and 1.1, and Exclusive Canonicalization
- [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md): Japanese, Chinese and Korean encodings

The [documentation](https://github.com/io-timeout/exemplar-docs) shows every part at work through common tasks, with a
reference for the details.

## License

Apache License 2.0. The decoding tables derive from Unicode, ICU and WHATWG data, whose licences and attributions ship
in `THIRD_PARTY_LICENSES`.
