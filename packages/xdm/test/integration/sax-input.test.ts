import { fc, test } from '@fast-check/vitest';
import { documents } from '@test/helpers/documents';
import { dump } from '@test/helpers/trees';
import { expect } from 'vitest';
import { SAXParser, XMLFilterImpl } from '@exemplarjs/sax';
import { XMLInputFactory } from '@exemplarjs/xml';
import { XdmDocumentBuilder } from '@/index';

// The nightly run scales the number of runs up.
const SCALE = Number(globalThis.process?.env['EXEMPLAR_FUZZ_SCALE'] ?? 1);
const RUNS = { numRuns: 100 * SCALE };

const builder = new XdmDocumentBuilder();

test.prop([documents, fc.integer({ min: 0, max: 3 }), fc.boolean()], RUNS)(
  'builds the same tree from SAX events, through any number of filters, as from the source',
  (xml, filters, namespacePrefixes) => {
    const handler = builder.createSAXHandler();
    let first: XMLFilterImpl['handler'] = handler;
    for (let i = 0; i < filters; i++) first = new XMLFilterImpl(first);
    new SAXParser(new XMLInputFactory({ namespacePrefixes })).parse(xml, first);
    expect(dump(handler.document)).toEqual(dump(builder.parse(xml)));
  }
);

test.prop([documents], RUNS)('builds the same tree from an event reader’s events as from the source', (xml) => {
  const built = builder.build(new XMLInputFactory().createEventReader(xml));
  expect(dump(built)).toEqual(dump(builder.parse(xml)));
});
