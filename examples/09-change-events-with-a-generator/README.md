# Change events with a generator

Reads a product list as event objects, changes them with a generator, builds an XDM tree from what the generator makes,
and queries it with XPath.

An event reader gives a document as objects, one per start tag, run of text, end tag and so on. Unlike the cursor's, an
event stays valid after the reader moves on, so events can be kept, changed and made anew. A generator function is the
natural way to change them: it takes the events in, and yields the events to keep, change or add.

Here the generator turns each price from pence into pounds:

- At a `price` start tag, it yields a new start tag from `XMLEventFactory`, with the old one's name and attributes and a
  `currency` attribute added.
- Inside a price, it yields new text: the amount in pounds.
- Everything else it passes on as it is.

`XdmDocumentBuilder.build` takes any iterable of events, so it builds straight from the generator. It checks what it is
given, as it checks a reader: elements must balance, with matching end tags.

Events cost more than the cursor, as each is an object. To drop content, a filter on the cursor is faster; see
[Drop content with a filter](../03-drop-content-with-a-filter).

## Files

- [`source.xml`](source.xml): two products, priced in pence.
- [`example.ts`](example.ts): the code.
- [`expected.txt`](expected.txt): what it prints.

Run it with `node example.ts`.
