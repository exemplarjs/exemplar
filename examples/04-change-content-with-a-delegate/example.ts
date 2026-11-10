import { createReadStream } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringSink, XMLOutputFactory } from '@exemplarjs/writer';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { createDelegatedReader, StreamReaderDelegate } from '@exemplarjs/xml/filters';

const KILOGRAMS_PER_POUND = 0.4536;
const CENTIMETRES_PER_INCH = 2.54;

/** A conversion of measurements in one unit to another: each is multiplied by `factor` and given `digits` decimal places. */
interface Conversion {
  readonly from: string;
  readonly to: string;
  readonly factor: number;
  readonly digits: number;
}

/** A reader that converts the measurements in one unit: the elements whose `unit` attribute names it. */
class Converted extends StreamReaderDelegate {
  readonly #conversion: Conversion;
  /** Whether the reader is inside an element measured in the unit to convert. */
  #converting = false;

  constructor(conversion: Conversion) {
    super();
    this.#conversion = conversion;
  }

  override next(): EventType {
    const type = super.next();
    // The parent gives the unit as the file has it; this reader's own answer would be the new unit.
    if (type === EventType.START_ELEMENT) this.#converting = this.parent.attribute('unit') === this.#conversion.from;
    else if (type === EventType.END_ELEMENT) this.#converting = false;
    return type;
  }

  override attributeValue(index: number): string {
    const isUnit = this.#converting && this.attributeLocalName(index) === 'unit';
    return isUnit ? this.#conversion.to : super.attributeValue(index);
  }

  override text(): string {
    const text = super.text();
    const { factor, digits } = this.#conversion;
    return this.#converting ? (Number(text) * factor).toFixed(digits) : text;
  }
}

/** Writes a catalog again with its weights and sizes in metric units, reading the file a piece at a time. */
export async function run(path: string): Promise<string> {
  const factory = new XMLInputFactory();
  // The file arrives in pieces, and the reader waits for each as it needs it.
  const stream = createReadStream(path);
  const source = factory.createAsyncStreamReader({ systemId: pathToFileURL(path).href, stream });
  // Each delegate converts one unit and reads through the one before it.
  const reader = createDelegatedReader(
    source,
    new Converted({ from: 'lb', to: 'kg', factor: KILOGRAMS_PER_POUND, digits: 2 }),
    new Converted({ from: 'in', to: 'cm', factor: CENTIMETRES_PER_INCH, digits: 1 })
  );
  const sink = new StringSink();
  const writer = new XMLOutputFactory({ indent: '  ' }).createStreamWriter(sink);
  // The writer writes what the delegates report as it is read, so the document is never held whole.
  await writer.copyAsync(reader);
  await writer.close();
  return sink.toString();
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(await run(source));
}
