import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XdmDocumentBuilder } from '@exemplarjs/xdm';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { XPathCompiler } from '@exemplarjs/xpath';

/** The namespace of the shop's export. */
const SHOP = 'urn:example:shop';

/** Totals each order in an export, building a tree of one order at a time. */
export function run(path: string): string {
  const factory = new XMLInputFactory();
  const reader = factory.createStreamReader({ systemId: pathToFileURL(path).href, bytes: readFileSync(path) });
  const builder = new XdmDocumentBuilder();
  const compiler = new XPathCompiler({ namespaces: { s: SHOP } });
  const id = compiler.compile('string(/s:order/@id)');
  const total = compiler.compile('sum(/s:order/s:line ! (xs:decimal(@price) * xs:integer(@quantity)))');

  const totals: string[] = [];
  // To the export element, then to each order in it.
  reader.nextTag();
  while (reader.nextTag() === EventType.START_ELEMENT) {
    // At a start tag, the builder builds that element alone, and leaves the reader at its end tag.
    const order = builder.parse(reader);
    totals.push(`${id.evaluateString(order)}: ${total.evaluateString(order)}`);
  }
  return totals.join('\n');
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
