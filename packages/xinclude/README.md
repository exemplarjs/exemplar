# @exemplarjs/xinclude

XInclude 1.0 for JavaScript: assemble documents from parts, in every reader and in the DOM, streaming.

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
| [`@exemplarjs/catalog`](../catalog/README.md)             | OASIS XML Catalogs 1.1                                                                       |
| `@exemplarjs/xinclude`                                    | XInclude 1.0, with XPointer                                                                  |
| [`@exemplarjs/canonical`](../canonical/README.md)         | Canonical XML 1.0 and 1.1, and Exclusive Canonicalization                                    |
| [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md) | Japanese, Chinese and Korean encodings                                                       |

## This package

`@exemplarjs/xinclude` replaces `xi:include` elements with what they point to, as JAXP's `setXIncludeAware(true)` does.
It works in every reader `@exemplarjs/xml` makes, the cursor, event objects, SAX and the DOM, and streams: a pointer
into another document skips to its target and passes that subtree through, buffering nothing. It passes 151 of the 153
applicable tests of the W3C XInclude Test Suite.

```bash
npm install @exemplarjs/xml @exemplarjs/xinclude
```

### Include

```ts
import { xincludeProcessor } from '@exemplarjs/xinclude';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';

const parts: Record<string, string> = {
  'file:///docs/chapter.xml': '<chapter id="c1"><title>Arrakis</title></chapter>',
  'file:///docs/notes.txt': 'Spice must flow.',
};

const xml = new XMLInputFactory({
  xinclude: xincludeProcessor(),
  accessExternalEntities: ['file'],
  entityResolver: {
    resolveEntity: ({ systemId, baseURI }) => {
      const uri = new URL(systemId ?? '', baseURI).href;
      return parts[uri] === undefined ? undefined : { systemId: uri, text: parts[uri] };
    },
  },
});

const book = `<book xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include href="chapter.xml"/>
  <note><xi:include href="notes.txt" parse="text"/></note>
</book>`;
const reader = xml.createStreamReader({ systemId: 'file:///docs/book.xml', text: book });
while (reader.next() !== EventType.END_DOCUMENT)
  if (reader.eventType() === EventType.START_ELEMENT) console.log(reader.localName());
```

`fileResolver({ root })` from `@exemplarjs/xml/resolvers/file` serves real files, and a catalog from
`@exemplarjs/catalog` maps targets to local copies.

### What it supports

- `parse="xml"` and `parse="text"`, with text encodings from HTTP, the bytes, or the `encoding` attribute.
- Pointers through the XPointer framework, with the `element()` scheme and shorthand pointers to IDs and `xml:id`.
- `xi:fallback` for resources that can't be read or pointers that find nothing.
- `accept` and `accept-language`, passed to your resolver and sent as HTTP headers by `fetchResolver`.
- `xml:base` and `xml:lang` fix-ups on included content, which
  `xincludeProcessor({ fixupBaseURIs: false, fixupLanguage: false })` turns off.
- Unparsed entities and notations from included content, merged into the result.
- Async readers, whose resolvers may answer with promises or streams.

Inclusion loops, malformed targets and misplaced XInclude elements are fatal errors with their own codes, as the
recommendation requires.

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
- [`@exemplarjs/canonical`](../canonical/README.md): Canonical XML 1.0 and 1.1, and Exclusive Canonicalization
- [`@exemplarjs/encodings-cjk`](../encodings-cjk/README.md): Japanese, Chinese and Korean encodings

The [documentation](https://github.com/io-timeout/exemplar-docs) shows every part at work through common tasks, with a
reference for the details.

## License

Apache License 2.0. The decoding tables derive from Unicode, ICU and WHATWG data, whose licences and attributions ship
in `THIRD_PARTY_LICENSES`.
