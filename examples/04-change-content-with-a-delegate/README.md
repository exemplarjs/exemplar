# Change content with a delegate

Writes a catalog whose weights are in pounds and sizes in inches as a metric one: each measurement is converted as it is
read, and written straight out. The file is read a piece at a time and no tree is built, so a catalog of any size takes
little memory.

`StreamReaderDelegate` wraps a reader and forwards every call to it. A subclass overrides the calls whose answers it
wants to change. Here `Converted` converts the measurements in one unit, the elements whose `unit` attribute names it:

- `next()` keeps track of whether the reader is inside such an element.
- `attributeValue(index)` returns the new unit for the `unit` attribute. That one override is enough:
  `attribute('unit')`, which finds an attribute by name, reads through it too.
- `text()` returns the measurement multiplied by the conversion's factor.

The example stacks two, one for pounds and one for inches. `createDelegatedReader` stacks delegates on a reader. Each is
made without a parent, and the function gives it one: the first reads the source, and each of the others reads through
the one before it. Another unit is one more delegate.

In `next()`, the delegate asks its parent for the unit, not itself: its own answer is the unit it converts to. For the
second delegate, the parent is the first, so it sees `kg` where the file has `lb`, and leaves the weights alone.

Any API that takes a reader also takes a delegate. Here the stream writer's `copyAsync` reads the stacked delegates and
writes what they report. Compare the output with [`source.xml`](source.xml), where the first book weighs `1.2` `lb` and
is `8.5` by `5.5` `in`; everything else is as it was.

The source is a stream of the file's bytes, so the reader is an asynchronous one: when it has read all it was given, it
waits for the next piece. `copyAsync` waits with it, and before each wait lets the destination catch up, so a slow
destination holds the reading back. Delegates such as these, which change the answer for the event the reader is at,
need nothing more to work this way.

The example writes to a `StringSink` so that its result can be checked. To write a file, pass a stream instead:

```ts
import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

const writer = new XMLOutputFactory().createStreamWriter(Writable.toWeb(createWriteStream('metric.xml')));
await writer.copyAsync(reader);
await writer.close();
```

A delegate is at its best changing what a file already holds. Adding to it, such as an attribute a start tag does not
have, takes an override of every call that reads attributes by position; a SAX filter does that in two lines, as
[SAX filters into XPath](../07-sax-filters-into-xpath) shows.

A delegate costs a little more than a filter, as every call goes through it. To drop events rather than change them, use
a filter.

## Files

- [`source.xml`](source.xml): three books, each with its weight in pounds and its height and width in inches.
- [`example.ts`](example.ts): the code.
- [`expected.xml`](expected.xml): the catalog it writes.

Run it with `node example.ts`.
