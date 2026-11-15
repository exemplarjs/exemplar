import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';

/** The child elements of a book that the listing shows. */
const FIELDS = new Set(['title', 'author', 'price']);

/** Lists each book in a catalog file, one line each: its id, title, author and price. */
export function run(path: string): string {
  const factory = new XMLInputFactory();
  // The system id lets errors name the file, and relative references resolve against it.
  const reader = factory.createStreamReader({ systemId: pathToFileURL(path).href, bytes: readFileSync(path) });
  const lines: string[] = [];
  let book = new Map<string, string>();
  for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
    if (type === EventType.START_ELEMENT) {
      const name = reader.localName();
      if (name === 'book') book = new Map([['id', reader.attribute('id') ?? '']]);
      // elementText() reads a text-only element to its end tag.
      else if (FIELDS.has(name)) book.set(name, reader.elementText());
    } else if (type === EventType.END_ELEMENT && reader.localName() === 'book') {
      lines.push(`${book.get('id')}: ${book.get('title')} by ${book.get('author')}, ${book.get('price')}`);
    }
  }
  return lines.join('\n');
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
