import { dump } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { CARRIERS, CUT_SHORT, DROPPING, UNBALANCING } from '@exemplarjs/test-support';
import { ErrorCode, XMLInputFactory } from '@exemplarjs/xml';
import { XdmDocumentBuilder } from '@/index';

/** The error a reader gives for CUT_SHORT. */
const CUT = expect.objectContaining({ code: ErrorCode.WF_UNEXPECTED_END, line: 1, column: 22 }) as unknown;
/** The error a reader gives whose filter leaves a tag without its partner. */
const MISMATCH = expect.objectContaining({ code: ErrorCode.WF_END_TAG_MISMATCH }) as unknown;

const factory = new XMLInputFactory();
const builder = new XdmDocumentBuilder();

describe.each(DROPPING)(
  'XdmDocumentBuilder reading a reader behind a filter that drops %s',
  (_dropped, filter, xml, reads) => {
    it.each(CARRIERS)('on %s, builds the document without them', (_carrier, carry) => {
      const built = builder.parse(carry(factory.createStreamReader(xml), filter()));
      expect(dump(built)).toEqual(dump(builder.parse(reads)));
    });
  }
);

describe.each(UNBALANCING)(
  'XdmDocumentBuilder reading a reader behind a filter that drops %s',
  (_dropped, filter, xml) => {
    it.each(CARRIERS)('on %s, fails as for a document whose tags do not match', (_carrier, carry) => {
      expect(() => builder.parse(carry(factory.createStreamReader(xml), filter()))).toThrow(MISMATCH);
    });
  }
);

describe('XdmDocumentBuilder reading a reader over a document that is cut short', () => {
  it.each(CARRIERS)(
    'behind a filter on %s, fails with the reader’s error, where the document ends',
    (_carrier, carry) => {
      const [, filter] = DROPPING[0] as (typeof DROPPING)[number];
      expect(() => builder.parse(carry(factory.createStreamReader(CUT_SHORT), filter()))).toThrow(CUT);
    }
  );
});
