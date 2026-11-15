import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringSink, XMLOutputFactory } from '@exemplarjs/writer';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader, type StreamFilter } from '@exemplarjs/xml/filters';

/** A filter that drops `cost` elements, with the text inside them. */
function buildCostFilter(): StreamFilter {
  // Whether the reader is inside a cost element.
  let inCost = false;
  return (reader) => {
    const type = reader.eventType();
    if (type === EventType.START_ELEMENT && reader.localName() === 'cost') inCost = true;
    const keep = !inCost;
    if (type === EventType.END_ELEMENT && reader.localName() === 'cost') inCost = false;
    return keep;
  };
}

/** A filter that drops text that is only whitespace: the source's layout. */
function buildWhitespaceFilter(): StreamFilter {
  return (reader) => !reader.isWhitespace();
}

/** Writes a product list for customers: the same list, without the cost prices, indented afresh. */
export function run(path: string): string {
  const input = new XMLInputFactory();
  const reader = input.createStreamReader({ systemId: pathToFileURL(path).href, bytes: readFileSync(path) });
  const sink = new StringSink();
  // The writer indents, in place of the layout the second filter drops.
  const writer = new XMLOutputFactory({ indent: '  ' }).createStreamWriter(sink);
  const filtered = createFilteredReader(reader, buildCostFilter(), buildWhitespaceFilter());
  // The writer writes the events that pass, as they are read.
  writer.copy(filtered);
  writer.flush();
  return sink.toString();
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
