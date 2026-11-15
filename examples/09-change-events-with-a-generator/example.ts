import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XdmDocumentBuilder } from '@exemplarjs/xdm';
import { EventType, XMLEventFactory, type XMLEvent, XMLInputFactory } from '@exemplarjs/xml';
import { XPathCompiler } from '@exemplarjs/xpath';

/** How many pence make a pound, and how many places a price in pounds has. */
const PENCE_PER_POUND = 100;
const PRICE_PLACES = 2;

const eventFactory = new XMLEventFactory();

/** Turns prices in pence into prices in pounds, each with a currency. */
function* inPounds(input: Iterable<XMLEvent>): Generator<XMLEvent> {
  let inPrice = false;
  for (const event of input) {
    if (event.type === EventType.START_ELEMENT && event.name.localName === 'price') {
      inPrice = true;
      // A new start tag, with the old one's name and attributes and one more.
      yield eventFactory.createStartElement(
        event.name,
        [...event.attributes, eventFactory.createAttribute('currency', 'GBP')],
        event.namespaces
      );
    } else if (inPrice && event.type === EventType.CHARACTERS) {
      yield eventFactory.createCharacters((Number(event.text) / PENCE_PER_POUND).toFixed(PRICE_PLACES));
    } else {
      if (event.type === EventType.END_ELEMENT) inPrice = false;
      yield event;
    }
  }
}

/** Reads a product list's events through a generator that changes them, builds a tree, and queries it. */
export function run(path: string): string {
  const reader = new XMLInputFactory().createEventReader({
    systemId: pathToFileURL(path).href,
    bytes: readFileSync(path),
  });
  // The builder takes any iterable of events: here, what the generator makes of the reader's.
  const products = new XdmDocumentBuilder().build(inPounds(reader));
  const compiler = new XPathCompiler();
  const listing = compiler.compile("//product ! (name || ': ' || price || ' ' || price/@currency)");
  const total = compiler.compile('sum(//price ! xs:decimal(.))');
  return [...listing.evaluateStrings(products), `Total: ${total.evaluateString(products)}`].join('\n');
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
