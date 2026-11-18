import { describe, expect, it } from 'vitest';
import { type AnyReader, CARRIERS, CUT_SHORT, DROPPING, UNBALANCING } from '@exemplarjs/test-support';
import { ErrorCode, XMLInputFactory } from '@exemplarjs/xml';
import { StringSink, XMLOutputFactory } from '@/index';

/** The error a reader gives for CUT_SHORT. */
const CUT = expect.objectContaining({ code: ErrorCode.WF_UNEXPECTED_END, line: 1, column: 22 }) as unknown;
/** The error a reader gives whose filter leaves a tag without its partner. */
const MISMATCH = expect.objectContaining({ code: ErrorCode.WF_END_TAG_MISMATCH }) as unknown;

const input = new XMLInputFactory();
const output = new XMLOutputFactory({ omitXMLDeclaration: true });

/** What `copy` writes of a reader. */
function copied(reader: AnyReader): string {
  const sink = new StringSink();
  const writer = output.createStreamWriter(sink);
  writer.copy(reader);
  writer.flush();
  return sink.toString();
}

/** What an event writer writes of the events read from a reader. */
function throughEvents(reader: AnyReader): string {
  const sink = new StringSink();
  const writer = output.createEventWriter(sink);
  writer.add(input.createEventReader(reader));
  writer.flush();
  return sink.toString();
}

describe.each([
  ['StreamWriter.copy', copied],
  ['an event writer', throughEvents],
] as const)('%s reading a reader behind a filter', (_consumer, write) => {
  describe.each(DROPPING)('that drops %s', (_dropped, filter, xml, reads) => {
    it.each(CARRIERS)('on %s, writes the document without them', (_carrier, carry) => {
      const reader = carry(input.createStreamReader(xml), filter());
      expect(write(reader)).toBe(reads);
    });
  });
});

describe.each(UNBALANCING)(
  'StreamWriter.copy reading a reader behind a filter that drops %s',
  (_dropped, filter, xml) => {
    it.each(CARRIERS)('on %s, fails as for a document whose tags do not match', (_carrier, carry) => {
      expect(() => copied(carry(input.createStreamReader(xml), filter()))).toThrow(MISMATCH);
    });
  }
);

describe.each([
  ['StreamWriter.copy', copied],
  ['an event writer', throughEvents],
] as const)('%s reading a reader over a document that is cut short', (_consumer, write) => {
  it.each(CARRIERS)(
    'behind a filter on %s, fails with the reader’s error, where the document ends',
    (_carrier, carry) => {
      const [, filter] = DROPPING[0] as (typeof DROPPING)[number];
      expect(() => write(carry(input.createStreamReader(CUT_SHORT), filter()))).toThrow(CUT);
    }
  );
});
