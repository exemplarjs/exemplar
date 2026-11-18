import { describe, expect, it } from 'vitest';
import {
  type AnyReader,
  CARRIERS,
  CUT_SHORT,
  DROPPING,
  eventTagsOf,
  tagsOf,
  UNBALANCING,
  canonicalOf,
  writeEvent,
} from '@exemplarjs/test-support';
import { ErrorCode, EventType, XMLInputFactory } from '@/index';

/** The error a reader gives for CUT_SHORT. */
const CUT = expect.objectContaining({ code: ErrorCode.WF_UNEXPECTED_END, line: 1, column: 22 }) as unknown;

const factory = new XMLInputFactory();

/** What the cursor's own methods report of a reader, in canonical form. */
function throughCursor(reader: AnyReader): string {
  let out = '';
  for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
    if (type === EventType.START_ELEMENT) out += `<${reader.name()}>`;
    else if (type === EventType.END_ELEMENT) out += `</${reader.name()}>`;
    else if (type === EventType.CHARACTERS) out += reader.text();
    else if (type === EventType.COMMENT) out += `<!--${reader.text()}-->`;
    else if (type === EventType.PROCESSING_INSTRUCTION) out += `<?${reader.piTarget()} ${reader.piData()}?>`;
  }
  return out;
}

/** What the events read from a reader are, in canonical form. */
function throughEvents(reader: AnyReader): string {
  return [...factory.createEventReader(reader)].map((event) => writeEvent(event)).join('');
}

describe.each(DROPPING)('a reader behind a filter that drops %s', (_dropped, filter, xml, reads) => {
  it.each(CARRIERS)('on %s, reads through the cursor as the document without them', (_carrier, carry) => {
    const expected = throughCursor(factory.createStreamReader(reads));
    const reader = carry(factory.createStreamReader(xml), filter());
    expect(throughCursor(reader)).toBe(expected);
  });

  it.each(CARRIERS)('on %s, gives the events of the document without them', (_carrier, carry) => {
    const expected = canonicalOf(factory.createStreamReader(reads));
    const reader = carry(factory.createStreamReader(xml), filter());
    expect(throughEvents(reader)).toBe(expected);
  });

  it.each(CARRIERS)(
    'on %s, skips and reads the text of elements as in the document without them',
    (_carrier, carry) => {
      /** Each child of the root: its name, then its text, or `skipped` when it holds elements. */
      const children = (reader: AnyReader): string[] => {
        const out: string[] = [];
        reader.nextTag();
        while (reader.nextTag() === EventType.START_ELEMENT) {
          const name = reader.name();
          if (name.includes(':')) out.push(`${name}=${reader.elementText()}`);
          else {
            reader.skipElement();
            out.push(`${name} skipped`);
          }
        }
        return out;
      };
      const expected = children(factory.createStreamReader(reads));
      const reader = carry(factory.createStreamReader(xml), filter());
      expect(children(reader)).toEqual(expected);
    }
  );
});

describe.each(UNBALANCING)('a reader behind a filter that drops %s', (_dropped, filter, xml) => {
  it.each(CARRIERS)('on %s, gives events whose end tags are named as the cursor names them', (_carrier, carry) => {
    const events = factory.createEventReader(carry(factory.createStreamReader(xml), filter()));
    const again = carry(factory.createStreamReader(xml), filter());
    expect(eventTagsOf(events)).toEqual(tagsOf(again));
  });
});

describe.each([
  ['the cursor', throughCursor],
  ['the event reader', throughEvents],
] as const)('%s reading a reader over a document that is cut short', (_consumer, read) => {
  it.each(CARRIERS)(
    'behind a filter on %s, fails with the reader’s error, where the document ends',
    (_carrier, carry) => {
      const [, filter] = DROPPING[0] as (typeof DROPPING)[number];
      expect(() => read(carry(factory.createStreamReader(CUT_SHORT), filter()))).toThrow(CUT);
    }
  );
});
