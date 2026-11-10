# SAX filters into XPath

Totals a file of orders by region. The file holds neither prices nor regions: SAX filters look them up and add them as
the file is read, so the tree built from it has them, and the query runs as if they had been there all along.

A SAX parser calls a handler's methods as it reads: `startElement`, `characters`, `endElement` and so on. A filter,
`XMLFilterImpl`, is a handler that passes each call on to the next handler. A subclass overrides the calls it wants to
change, calling `super` to pass on what it keeps. Filters wrap one another, so they form a chain from the parser to the
last handler.

Here one filter class, `Lookup`, is used twice. It adds an attribute to an element's start tags, with a value found in a
table by another attribute's value:

- one gives each `line` a `price`, found by its `sku`;
- one gives each `order` a `region`, found by its `store`.

The attributes a filter receives are valid only during the call, so `Lookup` adds to a copy, an `AttributesImpl`, and
passes that on.

The tables come from [`reference.xml`](reference.xml), read with a cursor before the orders are. In real code they would
be a database or a service. A filter answers straight away, so load or cache what it looks up first: it cannot wait for
a reply.

The last handler, `createSAXHandler()` on `XdmDocumentBuilder`, builds a tree from the calls it receives. Once the parse
is done, its `document` is the tree's document node. One XPath expression then totals the orders by region, multiplying
each line's quantity by the price a filter added.

The handler checks what the filters pass on. A filter that renamed an element's start tag but not its end tag would fail
with `WF_END_TAG_MISMATCH`, rather than build a broken tree.

## Files

- [`source.xml`](source.xml): three orders, each with a store and its lines' SKUs and quantities.
- [`reference.xml`](reference.xml): the products' prices and the stores' regions.
- [`example.ts`](example.ts): the code.
- [`expected.txt`](expected.txt): what it prints.

Run it with `node example.ts`.
