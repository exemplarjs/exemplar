import { describe, expect, it } from 'vitest';
import { createFilteredReader, StreamReaderDelegate } from '@/filters/index';
import { EventType, XMLInputFactory } from '@/index';

const xml = new XMLInputFactory();

/** A delegate that upper-cases text. */
class Upper extends StreamReaderDelegate {
  override text(): string {
    return super.text().toUpperCase();
  }
}

/** The text a reader gives, to the end of its document. */
function texts(reader: { next(): EventType; text(): string }): string[] {
  const out: string[] = [];
  for (let e = reader.next(); e !== EventType.END_DOCUMENT; e = reader.next()) {
    if (e === EventType.CHARACTERS) out.push(reader.text());
  }
  return out;
}

describe('filtered delegates (createFilteredReader over a delegate)', () => {
  it('are a new delegate over the one given, whose filter sees the changes it makes', () => {
    const delegate = new Upper(xml.createStreamReader('<a><b>keep</b><b>drop</b></a>'));
    const filtered = createFilteredReader(
      delegate,
      (r) => r.eventType() !== EventType.CHARACTERS || r.text() !== 'DROP'
    );
    expect(filtered).not.toBe(delegate);
    expect(filtered).toBeInstanceOf(StreamReaderDelegate);
    expect(texts(filtered)).toEqual(['KEEP']);
  });

  it('take several filters, each reading through the one before', () => {
    const delegate = new Upper(xml.createStreamReader('<a><b>keep</b><b>drop</b><b>skip</b></a>'));
    const filtered = createFilteredReader(
      delegate,
      (r) => r.eventType() !== EventType.CHARACTERS || r.text() !== 'DROP',
      (r) => r.eventType() !== EventType.CHARACTERS || r.text() !== 'SKIP'
    );
    expect(texts(filtered)).toEqual(['KEEP']);
  });

  it('pass on the end of the document and the need for input, whatever the filter says', () => {
    const reader = createFilteredReader(new StreamReaderDelegate(xml.createAsyncStreamReader()), () => false);
    expect(reader.next()).toBe(EventType.NEED_INPUT);
    reader.feed(new TextEncoder().encode('<a>x</a>'));
    reader.endOfInput();
    expect(reader.next()).toBe(EventType.END_DOCUMENT);
  });
});
