# Events into a file

Renames the elements of a feed with a generator over its events, and writes the result as a new document.

The generator yields a new start or end tag, from `XMLEventFactory`, for each one it renames, keeping the attributes and
namespaces of the old one, and passes everything else on as it is.

`EventWriter.add` takes one event or any iterable of them, so it writes straight from the generator, checking what it
writes as the stream writer does.

Compare the output with [`source.xml`](source.xml): the feed, its entries and their titles are now news, stories and
headlines, and everything else is as it was.

The example writes to a `StringSink` so that its result can be checked. To write a file, pass a stream instead, and
close the writer once it is done:

```ts
import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

const writer = new XMLOutputFactory().createEventWriter(Writable.toWeb(createWriteStream('news.xml')));
writer.add(asNews(reader));
await writer.close();
```

## Files

- [`source.xml`](source.xml): a feed of two entries.
- [`example.ts`](example.ts): the code.
- [`expected.xml`](expected.xml): the news document it writes.

Run it with `node example.ts`.
