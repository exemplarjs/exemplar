# One record at a time

Totals each order in an export, building a small tree for one order at a time rather than one tree for the whole file.

A builder given a reader builds from where the reader stands. At the start of the document, it builds the whole
document. At a start tag, it builds that element as a document of its own, and leaves the reader at the element's end
tag. A loop of `nextTag()` and `parse(reader)` then visits each record in turn, and each tree can be dropped once it has
been queried, so memory stays flat however large the file is.

The tree of each order keeps the namespaces its ancestors declared: here the export's default namespace, which the `s:`
prefix in the queries names.

The same works with `DocumentBuilder` for DOM trees and `SAXParser` for SAX handlers.

## Files

- [`source.xml`](source.xml): an export of three orders.
- [`example.ts`](example.ts): the code.
- [`expected.txt`](expected.txt): what it prints.

Run it with `node example.ts`.
