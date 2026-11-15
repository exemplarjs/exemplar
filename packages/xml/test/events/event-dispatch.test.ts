import { describe, expect, it } from 'vitest';
import { EventDispatcher, type EventHandler } from '@/events/event-dispatch';
import { EventType, XMLEventFactory, XMLInputFactory, type XMLEvent } from '@/index';
import type { SAXLocator } from '@/util/structure';

const events = new XMLEventFactory();

/** A handler that records each call, with the locator's line for start tags. */
function recorder(): { handler: EventHandler; calls: string[] } {
  const calls: string[] = [];
  let locator: SAXLocator | undefined;
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(`${name}(${args.map(String).join(', ')})`);
    };
  const handler: EventHandler = {
    setDocumentLocator: (given) => {
      locator = given;
    },
    startElement: (uri, localName, qName, attributes) => {
      const list = Array.from({ length: attributes.length }, (_, i) => `${attributes.qName(i)}=${attributes.value(i)}`);
      calls.push(
        `startElement(${uri}, ${localName}, ${qName}, [${list.join(' ')}]) at ${locator?.lineNumber}:${locator?.columnNumber}`
      );
    },
  };
  for (const name of [
    'startDocument',
    'endDocument',
    'startPrefixMapping',
    'endPrefixMapping',
    'endElement',
    'characters',
    'ignorableWhitespace',
    'processingInstruction',
    'skippedEntity',
    'startDTD',
    'endDTD',
    'startEntity',
    'endEntity',
    'startCDATA',
    'endCDATA',
    'comment',
    'internalEntityDecl',
    'externalEntityDecl',
    'notationDecl',
    'unparsedEntityDecl',
  ] as const) {
    (handler as Record<string, unknown>)[name] = record(name);
  }
  return { handler, calls };
}

/** The calls a document's events make on a recording handler. */
function dispatched(input: Iterable<XMLEvent>): string[] {
  const { handler, calls } = recorder();
  new EventDispatcher(handler).dispatchAll(input);
  return calls;
}

describe('EventDispatcher', () => {
  it('passes a document’s events on as a SAX parser reports them', () => {
    const xml =
      '<!DOCTYPE r [<!ENTITY t "x"><!ENTITY e SYSTEM "e.xml"><!NOTATION n SYSTEM "n"><!NOTATION m PUBLIC "m"><!ENTITY u SYSTEM "u" NDATA n><!ENTITY % p "">]>' +
      '<r xmlns:p="urn:p" p:a="1"><?pi d?>t<![CDATA[c]]><!--k-->&t;</r>';
    const reader = new XMLInputFactory({ replaceEntityReferences: false }).createEventReader({
      text: xml,
      systemId: 'file:///d/doc.xml',
    });
    expect(dispatched(reader)).toEqual([
      'startDocument()',
      'startDTD(r, undefined, undefined)',
      'notationDecl(n, undefined, file:///d/n)',
      'notationDecl(m, m, undefined)',
      'internalEntityDecl(t, x)',
      'externalEntityDecl(e, undefined, file:///d/e.xml)',
      'unparsedEntityDecl(u, undefined, file:///d/u, n)',
      'endDTD()',
      'startPrefixMapping(p, urn:p)',
      'startElement(, r, r, [p:a=1]) at 1:151',
      'processingInstruction(pi, d)',
      'characters(t)',
      'startCDATA()',
      'characters(c)',
      'endCDATA()',
      'comment(k)',
      'skippedEntity(t)',
      'endElement(, r, r)',
      'endPrefixMapping(p)',
      'endDocument()',
    ]);
  });

  it('passes on ignorable whitespace and entity boundaries', () => {
    expect(
      dispatched([
        events.createStartElement('', '', 'r'),
        events.createIgnorableSpace(' '),
        { type: EventType.START_ENTITY, name: 'e', location: { line: 0, column: 0, offset: 0 } },
        { type: EventType.END_ENTITY, name: 'e', location: { line: 0, column: 0, offset: 0 } },
        events.createEndElement('', '', 'r'),
        events.createEndDocument(),
      ])
    ).toEqual([
      'startDocument()',
      'startElement(, r, r, []) at 0:0',
      'ignorableWhitespace( )',
      'startEntity(e)',
      'endEntity(e)',
      'endElement(, r, r)',
      'endDocument()',
    ]);
  });

  it('starts and ends the document of events that leave them out, such as one element’s', () => {
    expect(dispatched([events.createStartElement('', '', 'a'), events.createEndElement('', '', 'a')])).toEqual([
      'startDocument()',
      'startElement(, a, a, []) at 0:0',
      'endElement(, a, a)',
      'endDocument()',
    ]);
    expect(dispatched([])).toEqual(['startDocument()', 'endDocument()']);
  });

  it('gives a start tag’s attributes their namespace, local name, type and whether they were specified', () => {
    let seen: unknown[] = [];
    const handler: EventHandler = {
      startElement: (_uri, _localName, _qName, attributes) => {
        seen = [attributes.uri(0), attributes.localName(0), attributes.type(0), attributes.isSpecified(0)];
      },
    };
    new EventDispatcher(handler).dispatchAll(new XMLInputFactory().createEventReader('<r xmlns:p="urn:p" p:a="1"/>'));
    expect(seen).toEqual(['urn:p', 'a', 'CDATA', true]);
  });

  it('says nowhere in particular before it has an event to place', () => {
    let locator: SAXLocator | undefined;
    let where: unknown[] = [];
    const handler: EventHandler = {
      setDocumentLocator: (given) => {
        locator = given;
      },
      endDocument: () => {
        where = [locator?.lineNumber, locator?.columnNumber, locator?.systemId, locator?.xmlVersion];
      },
    };
    new EventDispatcher(handler).dispatchAll([]);
    expect(where).toEqual([0, 0, undefined, '1.0']);
  });

  it('passes events on as they arrive, from an async event reader in batches or from any async iterable', async () => {
    const { handler, calls } = recorder();
    const reader = new XMLInputFactory().createAsyncEventReader(new TextEncoder().encode('<a>x</a>'));
    await new EventDispatcher(handler).dispatchAllAsync(reader);
    async function* generated(): AsyncGenerator<XMLEvent> {
      yield events.createStartElement('', '', 'b');
      yield events.createEndElement('', '', 'b');
    }
    const second = recorder();
    await new EventDispatcher(second.handler).dispatchAllAsync(generated());
    expect([calls.length, second.calls]).toEqual([
      5,
      ['startDocument()', 'startElement(, b, b, []) at 0:0', 'endElement(, b, b)', 'endDocument()'],
    ]);
  });

  it('passes on to a handler that has none of the methods', () => {
    expect(() =>
      new EventDispatcher({}).dispatchAll(
        new XMLInputFactory().createEventReader(
          '<!DOCTYPE a [<!ENTITY e "x"><!ENTITY f SYSTEM "f"><!NOTATION n SYSTEM "n"><!ENTITY u SYSTEM "u" NDATA n>]><a>&e;<![CDATA[c]]></a>'
        )
      )
    ).not.toThrow();
  });
});
