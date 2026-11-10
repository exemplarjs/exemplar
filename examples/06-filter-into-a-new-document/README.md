# Filter into a new document

Writes a product list for customers: the same list, without the cost prices, and without building a tree.

The filter from `buildCostFilter` drops each `cost` element, its start tag, its text and its end tag, as in
[Drop content with a filter](../03-drop-content-with-a-filter). The stream writer's `copy` reads the filtered reader and
writes each event that passes, with no objects made in between. Compare the output with [`source.xml`](source.xml): the
costs are gone.

Dropping an element leaves the line break and spaces around it behind, so the filter from `buildWhitespaceFilter` drops
the text that is only whitespace, and the output factory's `indent` option lays the result out afresh. The output is
then the same however the source is laid out. That suits data like this list; in mixed content, whitespace between
elements can be part of the text and must be kept.

Reading, filtering and writing go one event at a time, so a file of any size takes little memory.

The example writes to a `StringSink` so that its result can be checked. To write a file, pass a stream instead, and
close the writer when it is done:

```ts
import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

const writer = new XMLOutputFactory().createStreamWriter(Writable.toWeb(createWriteStream('customer.xml')));
writer.copy(filtered);
await writer.close();
```

## Files

- [`source.xml`](source.xml): two products, each with a price and a cost.
- [`example.ts`](example.ts): the code.
- [`expected.xml`](expected.xml): the product list it writes.

Run it with `node example.ts`.
