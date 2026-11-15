# Read a file

Reads an XML file with the cursor and lists each book it describes.

The cursor, `XMLStreamReader` in StAX, is exemplar's fastest way to read XML. It moves through the document one event at
a time: a start tag, some text, an end tag. Your code asks for the event's details only when it needs them, so nothing
is built that you don't use.

- `createStreamReader` takes the file's bytes; exemplar detects the encoding, as the XML declaration says it should.
  Giving the file's URL as `systemId` lets errors name the file.
- `next()` moves to the next event and returns its type.
- At a book's start tag, `attribute('id')` reads its `id`. At a title, author or price, `elementText()` reads the text
  and stops at the end tag.
- At a book's end tag, the example writes the line.

## Files

- [`source.xml`](source.xml): a shop's catalog of three books.
- [`example.ts`](example.ts): the code.
- [`expected.txt`](expected.txt): what it prints.

Run it with `node example.ts`.
