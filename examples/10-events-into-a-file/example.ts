import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringSink, XMLOutputFactory } from '@exemplarjs/writer';
import { EventType, QName, XMLEventFactory, type XMLEvent, XMLInputFactory } from '@exemplarjs/xml';

/** The new names of the feed's elements. */
const NEW_NAMES: Readonly<Record<string, string>> = { feed: 'news', entry: 'story', title: 'headline' };

const eventFactory = new XMLEventFactory();

/** The new name for an element's name. */
function renamed(name: QName): QName {
  const local = NEW_NAMES[name.localName];
  return local === undefined ? name : new QName(name.namespaceURI, local, name.prefix);
}

/** Renames the feed's elements, at their start and end tags alike. */
function* asNews(input: Iterable<XMLEvent>): Generator<XMLEvent> {
  for (const event of input) {
    if (event.type === EventType.START_ELEMENT) {
      yield eventFactory.createStartElement(renamed(event.name), event.attributes, event.namespaces);
    } else if (event.type === EventType.END_ELEMENT) {
      yield eventFactory.createEndElement(renamed(event.name), event.namespaces);
    } else {
      yield event;
    }
  }
}

/** Writes a feed as a news document, from the events a generator makes of the feed's. */
export function run(path: string): string {
  const reader = new XMLInputFactory().createEventReader({
    systemId: pathToFileURL(path).href,
    bytes: readFileSync(path),
  });
  const sink = new StringSink();
  const writer = new XMLOutputFactory({ indent: '  ' }).createEventWriter(sink);
  // The event writer takes any iterable of events: here, what the generator makes of the reader's.
  writer.add(asNews(reader));
  writer.flush();
  return sink.toString();
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
