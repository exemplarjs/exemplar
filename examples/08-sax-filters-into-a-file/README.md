# SAX filters into a file

Changes the attributes of a product list with SAX filters, and writes the result as a new document.

Two filters change attributes as they pass, each on a copy, an `AttributesImpl`, as the attributes a filter receives are
valid only during the call:

- `RenameSku` renames each product's `sku` attribute to `code`, changing its local and qualified names.
- `AddCurrency` adds a `currency` attribute to every price.

The last handler, `createSAXHandler()` on `XMLOutputFactory`, writes the calls it receives as XML. The stream writer
behind it checks what it writes, as it does for any caller.

Compare the output with [`source.xml`](source.xml): `sku` is now `code`, every price has a currency, and everything else
is as it was.

The example writes to a `StringSink` so that its result can be checked. To write a file, pass a stream instead, and
close the handler once the parse is done:

```ts
import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

const handler = new XMLOutputFactory().createSAXHandler(Writable.toWeb(createWriteStream('products.xml')));
new SAXParser().parse(source, new RenameSku(new AddCurrency(handler)));
await handler.close();
```

## Files

- [`source.xml`](source.xml): two products.
- [`example.ts`](example.ts): the code.
- [`expected.xml`](expected.xml): the product list it writes.

Run it with `node example.ts`.
