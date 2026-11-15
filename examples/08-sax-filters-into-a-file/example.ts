import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Attributes, AttributesImpl, SAXParser, XMLFilterImpl } from '@exemplarjs/sax';
import { StringSink, XMLOutputFactory } from '@exemplarjs/writer';

/** Renames each product's `sku` attribute to `code`. */
class RenameSku extends XMLFilterImpl {
  override startElement(uri: string, localName: string, qName: string, attributes: Attributes): void {
    const skuIndex = attributes.index('sku');
    if (skuIndex < 0) {
      super.startElement(uri, localName, qName, attributes);
      return;
    }
    const changed = new AttributesImpl(attributes);
    changed.setLocalName(skuIndex, 'code');
    changed.setQName(skuIndex, 'code');
    super.startElement(uri, localName, qName, changed);
  }
}

/** Gives every price a currency. */
class AddCurrency extends XMLFilterImpl {
  override startElement(uri: string, localName: string, qName: string, attributes: Attributes): void {
    if (localName !== 'price') {
      super.startElement(uri, localName, qName, attributes);
      return;
    }
    const changed = new AttributesImpl(attributes);
    changed.addAttribute('', 'currency', 'currency', 'CDATA', 'GBP');
    super.startElement(uri, localName, qName, changed);
  }
}

/** Writes a product list with its attributes changed by SAX filters. */
export function run(path: string): string {
  const sink = new StringSink();
  // The last handler writes what the filters pass on.
  const handler = new XMLOutputFactory({ indent: '  ' }).createSAXHandler(sink);
  const filters = new RenameSku(new AddCurrency(handler));
  new SAXParser().parse({ systemId: pathToFileURL(path).href, bytes: readFileSync(path) }, filters);
  return sink.toString();
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
