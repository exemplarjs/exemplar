# Drop content with a filter

Removes a catalog's comment, internal notes and layout as it is read, then builds a tree of what is left and writes it
out indented.

A filter is a function that sees each event and returns whether to keep it. `createFilteredReader` returns a reader that
passes on only the events the filter keeps. Over a cursor, the filter runs inside the cursor's own `next()`, so this is
the fastest way to drop content: nothing is copied or wrapped.

A filter sees one event at a time. To drop an element with everything inside it, the filter from `buildInternalFilter`
counts the elements open in it, the element itself included, and rejects every event until the count is back to 0.

`createFilteredReader` takes any number of filters and runs them in order: a filter sees only the events the ones before
it kept. The filter from `buildCommentAndWhitespaceFilter` then drops the comment and the text that is only whitespace.

Any API that takes a source also takes a reader, so `XdmDocumentBuilder.parse` builds from the filtered reader directly.
XPath's `serialize` then writes the tree, with an XML declaration and indentation because the example asks for them.
Compare it with [`source.xml`](source.xml): the comment and the `internal` elements are gone.

The line breaks and spaces between elements are text, which a reader reports like any other. Dropping an element leaves
the whitespace around it behind, so the result would depend on how the source is laid out. Dropping all of it and
indenting on the way out gives the same result for any layout. That suits data like this catalog; in mixed content, such
as `<p><b>big</b> <i>news</i></p>`, the space between the words is whitespace-only text too, and must be kept.

Every builder checks what a reader gives it. A filter that dropped an element's start tag but kept its end tag would
fail with `WF_END_TAG_MISMATCH`, rather than build a broken tree.

## Files

- [`source.xml`](source.xml): a catalog with a comment and internal notes.
- [`example.ts`](example.ts): the code.
- [`expected.xml`](expected.xml): the catalog it writes.

Run it with `node example.ts`.
