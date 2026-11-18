import { recorder } from '@test/helpers/recorder';
import { describe, expect, it } from 'vitest';
import { type AnyReader, CARRIERS, CUT_SHORT, DROPPING, UNBALANCING } from '@exemplarjs/test-support';
import { ErrorCode, XMLInputFactory } from '@exemplarjs/xml';
import { SAXParser } from '@/index';

/** The error a reader gives for CUT_SHORT. */
const CUT = expect.objectContaining({ code: ErrorCode.WF_UNEXPECTED_END, line: 1, column: 22 }) as unknown;
/** The error a reader gives whose filter leaves a tag without its partner. */
const MISMATCH = expect.objectContaining({ code: ErrorCode.WF_END_TAG_MISMATCH }) as unknown;

const factory = new XMLInputFactory();

/** The calls a parse of `input` makes on a recording handler. */
function calls(input: AnyReader | string): string[] {
  const { handler, calls: out } = recorder();
  new SAXParser(factory).parse(input, handler);
  return out;
}

describe.each(DROPPING)('SAXParser reading a reader behind a filter that drops %s', (_dropped, filter, xml, reads) => {
  it.each(CARRIERS)('on %s, reports the document without them', (_carrier, carry) => {
    const reader = carry(factory.createStreamReader(xml), filter());
    expect(calls(reader)).toEqual(calls(reads));
  });
});

describe.each(UNBALANCING)('SAXParser reading a reader behind a filter that drops %s', (_dropped, filter, xml) => {
  it.each(CARRIERS)('on %s, fails as for a document whose tags do not match', (_carrier, carry) => {
    const reader = carry(factory.createStreamReader(xml), filter());
    expect(() => new SAXParser(factory).parse(reader, {})).toThrow(MISMATCH);
  });
});

describe('SAXParser reading a reader over a document that is cut short', () => {
  it.each(CARRIERS)(
    'behind a filter on %s, fails with the reader’s error, where the document ends',
    (_carrier, carry) => {
      const [, filter] = DROPPING[0] as (typeof DROPPING)[number];
      expect(() => new SAXParser(factory).parse(carry(factory.createStreamReader(CUT_SHORT), filter()), {})).toThrow(
        CUT
      );
    }
  );
});
