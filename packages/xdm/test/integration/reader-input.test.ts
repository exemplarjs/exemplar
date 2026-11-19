import { fc, test } from '@fast-check/vitest';
import { documents } from '@test/helpers/documents';
import { dump } from '@test/helpers/trees';
import { expect } from 'vitest';
import { streamOf, utf8, readerAt } from '@exemplarjs/test-support';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader, StreamReaderDelegate } from '@exemplarjs/xml/filters';
import { NodeKind, XdmDocumentBuilder, type XdmNode } from '@/index';

// The release run scales the number of runs up.
const SCALE = Number(globalThis.process?.env['EXEMPLAR_FUZZ_SCALE'] ?? 1);
const RUNS = { numRuns: 100 * SCALE };

const factory = new XMLInputFactory();
const builder = new XdmDocumentBuilder();

/** The elements of a tree, in document order. */
function elementsOf(node: XdmNode): XdmNode[] {
  const children = node.children().filter((child) => child.kind === NodeKind.ELEMENT);
  return children.flatMap((child) => [child, ...elementsOf(child)]);
}

test.prop([documents], RUNS)(
  'builds the same tree from a cursor, a delegate and a filter as from the source',
  (xml) => {
    const expected = dump(builder.parse(xml));
    const readers = [
      factory.createStreamReader(xml),
      new StreamReaderDelegate(factory.createStreamReader(xml)),
      createFilteredReader(factory.createStreamReader(xml), () => true),
    ];
    for (const reader of readers) expect(dump(builder.parse(reader))).toEqual(expected);
  }
);

test.prop([documents], RUNS)('builds each element from a cursor at its start tag as it is in the whole tree', (xml) => {
  const whole = elementsOf(builder.parse(xml));
  for (const [index, element] of whole.entries()) {
    const reader = readerAt(factory, xml, index);
    const record = builder.parse(reader);
    expect(dump(record.children()[0] as XdmNode)).toEqual(dump(element));
    expect([reader.eventType(), reader.localName()]).toEqual([EventType.END_ELEMENT, element.localName]);
  }
});

test.prop([documents, fc.integer({ min: 1, max: 16 })], RUNS)(
  'builds the same tree from an asynchronous cursor over a stream, in chunks of any size',
  async (xml, size) => {
    const stream = streamOf(utf8(xml), size);
    const reader = new StreamReaderDelegate(factory.createAsyncStreamReader(stream));
    const built = await builder.parseAsync(reader);
    expect(dump(built)).toEqual(dump(builder.parse(xml)));
  }
);
