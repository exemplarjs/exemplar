import { validating, validityErrors, withSubset } from '@test/helpers/validity';
import { describe, expect, it } from 'vitest';
import { SAXParser } from '@exemplarjs/sax';
import { type AnyReader, CARRIERS } from '@exemplarjs/test-support';
import { EventType, type XMLError } from '@exemplarjs/xml';
import type { StreamFilter } from '@exemplarjs/xml/filters';

/** An invalid document: a repeated ID, a missing attribute, an undeclared child and a misplaced element. */
const INVALID = withSubset(
  'r',
  '<!ELEMENT r (s+)><!ELEMENT s (#PCDATA|t)*><!ELEMENT t EMPTY><!ATTLIST s id ID #REQUIRED>',
  '<r><s id="a">x<t/></s><s id="a"/><s><u/></s><t/></r>'
);

/** A filter that keeps only the root's tags, so a consumer sees none of what is invalid. */
const rootOnly: StreamFilter = (reader) => {
  const type = reader.eventType();
  return (type !== EventType.START_ELEMENT && type !== EventType.END_ELEMENT) || reader.localName() === 'r';
};

/** Every consumer of a reader. */
const CONSUMERS: readonly (readonly [string, (reader: AnyReader) => void])[] = [
  [
    'the cursor',
    (reader) => {
      while (reader.next() !== EventType.END_DOCUMENT);
    },
  ],
  ['the event reader', (reader) => void [...validating([]).createEventReader(reader)]],
  ['SAX', (reader) => new SAXParser(validating([])).parse(reader, {})],
];

/** The code and location of each error. */
const summary = (errors: readonly XMLError[]): string[] => errors.map((e) => `${e.code} ${e.line}:${e.column}`);

describe.each(CONSUMERS)('%s reading a validating reader behind a filter', (_consumer, consume) => {
  it.each(CARRIERS)(
    'on %s, has every validity error reported, though the filter drops the content',
    (_carrier, carry) => {
      const errors: XMLError[] = [];
      consume(carry(validating(errors).createStreamReader(INVALID), rootOnly));
      expect(summary(errors)).toEqual(summary(validityErrors(INVALID)));
      expect(errors.length).toBeGreaterThan(0);
    }
  );
});
