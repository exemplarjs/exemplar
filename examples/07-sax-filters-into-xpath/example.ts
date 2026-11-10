import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Attributes, AttributesImpl, type SAXHandler, SAXParser, XMLFilterImpl } from '@exemplarjs/sax';
import { XdmDocumentBuilder } from '@exemplarjs/xdm';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { XPathCompiler } from '@exemplarjs/xpath';

/** A table of values by key, as a database lookup would give them. */
type Table = ReadonlyMap<string, string>;

/** What a lookup adds: on each `element`, an attribute named `adds`, found in `table` by the value of its `key` attribute. */
interface LookupOptions {
  readonly element: string;
  readonly key: string;
  readonly adds: string;
  readonly table: Table;
}

/** A filter that adds an attribute to an element's start tags, with a value looked up by another attribute's. */
class Lookup extends XMLFilterImpl {
  readonly #options: LookupOptions;

  constructor(options: LookupOptions, handler: SAXHandler) {
    super(handler);
    this.#options = options;
  }

  override startElement(uri: string, localName: string, qName: string, attributes: Attributes): void {
    const { element, key, adds, table } = this.#options;
    const found = localName === element ? table.get(attributes.value(key) ?? '') : undefined;
    if (found === undefined) {
      super.startElement(uri, localName, qName, attributes);
      return;
    }
    // The attributes a filter receives are valid only during the call, so the filter adds to a copy.
    const changed = new AttributesImpl(attributes);
    changed.addAttribute('', adds, adds, 'CDATA', found);
    super.startElement(uri, localName, qName, changed);
  }
}

/** Reads the reference file into tables: each product's price by SKU, and each store's region by id. */
function readReference(file: string): { prices: Table; regions: Table } {
  const prices = new Map<string, string>();
  const regions = new Map<string, string>();
  const source = { systemId: pathToFileURL(file).href, bytes: readFileSync(file) };
  const reader = new XMLInputFactory().createStreamReader(source);
  for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
    if (type !== EventType.START_ELEMENT) continue;
    if (reader.localName() === 'product') prices.set(reader.attribute('sku') ?? '', reader.attribute('price') ?? '');
    if (reader.localName() === 'store') regions.set(reader.attribute('id') ?? '', reader.attribute('region') ?? '');
  }
  return { prices, regions };
}

/** Totals a file of orders by region, with each line's price and each order's region looked up as the file is read. */
export function run(file: string): string {
  const { prices, regions } = readReference(path.join(path.dirname(file), 'reference.xml'));
  const builder = new XdmDocumentBuilder();
  // The chain runs from the parser through each filter to the handler that builds the tree.
  const handler = builder.createSAXHandler();
  const withRegions = new Lookup({ element: 'order', key: 'store', adds: 'region', table: regions }, handler);
  const withPrices = new Lookup({ element: 'line', key: 'sku', adds: 'price', table: prices }, withRegions);
  new SAXParser().parse({ systemId: pathToFileURL(file).href, bytes: readFileSync(file) }, withPrices);

  // Once the parse is done, the handler's document is the tree it built.
  const orders = handler.document;
  // The query reads the prices and regions as if the file had held them.
  const totals = new XPathCompiler().compile(`
    for $region in sort(distinct-values(//order/@region))
    return $region || ': ' || format-number(
      sum(//order[@region = $region]/line ! (xs:decimal(@price) * xs:integer(@qty))), '0.00')
  `);
  return totals.evaluateStrings(orders).join('\n');
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
