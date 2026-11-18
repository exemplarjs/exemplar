import { recorder } from '@test/helpers/recorder';
import { describe, expect, it } from 'vitest';
import { readerAt } from '@exemplarjs/test-support';
import { XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader, StreamReaderDelegate } from '@exemplarjs/xml/filters';
import { SAXParser } from '@/index';

const DOCUMENTS = [
  '<?xml version="1.0"?><!--c--><?p d?><r xmlns="urn:d" xmlns:p="urn:p"><p:a p:x="1" y="2">t<![CDATA[c]]></p:a><b xmlns=""><c/></b></r>',
  '<!DOCTYPE r [<!ENTITY e "<i>x</i>"><!ATTLIST r d CDATA "dv"><!NOTATION n SYSTEM "s">]><r>&e;<s>&e;</s></r>',
  '<r xml:lang="en"><s xmlns:q="urn:q"><q:t q:u="1"><v/></q:t></s></r>',
];

const factory = new XMLInputFactory();

/** The calls a parse of `input` makes on a recording handler. */
function calls(input: Parameters<SAXParser['parse']>[0]): string[] {
  const { handler, calls: out } = recorder();
  new SAXParser(factory).parse(input, handler);
  return out;
}

/** The calls but those for prefix mappings. */
function withoutMappings(list: readonly string[]): string[] {
  return list.filter((call) => !call.startsWith('startPrefixMapping') && !call.startsWith('endPrefixMapping'));
}

/** The calls from an element's start tag to its end tag, given the index of its start tag's call. */
function elementCalls(list: readonly string[], start: number): string[] {
  let depth = 0;
  for (let i = start; i < list.length; i++) {
    if ((list[i] as string).startsWith('startElement')) depth++;
    else if ((list[i] as string).startsWith('endElement') && --depth === 0) return list.slice(start, i + 1);
  }
  return [];
}

describe('SAXParser: reading a reader agrees with reading a source', () => {
  it.each(DOCUMENTS)('through a cursor, a delegate and a filter: %s', (xml) => {
    const expected = calls(xml);
    const readers = [
      factory.createStreamReader(xml),
      new StreamReaderDelegate(factory.createStreamReader(xml)),
      createFilteredReader(factory.createStreamReader(xml), () => true),
    ];
    for (const reader of readers) expect(calls(reader)).toEqual(expected);
  });

  it.each(DOCUMENTS)('one element at a time, each inherited mapping started and ended around it: %s', (xml) => {
    const whole = withoutMappings(calls(xml));
    const starts = whole.flatMap((call, index) => (call.startsWith('startElement') ? [index] : []));
    for (const [index, start] of starts.entries()) {
      const record = calls(readerAt(factory, xml, index));
      expect(withoutMappings(record)).toEqual(['startDocument()', ...elementCalls(whole, start), 'endDocument()']);
      const started = record.flatMap((call) => /^startPrefixMapping\(([^,]*),/.exec(call)?.[1] ?? []);
      const ended = record.flatMap((call) => /^endPrefixMapping\((.*)\)$/.exec(call)?.[1] ?? []);
      expect([ended.length, new Set(ended)]).toEqual([started.length, new Set(started)]);
    }
  });
});
