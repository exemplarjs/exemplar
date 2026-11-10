import { describe, expect, it } from 'vitest';
import { EventType, QName, XMLEventFactory, XMLInputFactory, type XMLEvent } from '@/index';

const events = new XMLEventFactory();

/** The parts of an event the tests compare. */
function shown(event: XMLEvent): unknown {
  switch (event.type) {
    case EventType.START_ELEMENT: {
      const attributes = event.attributes.map(
        (a) => `${a.prefix}|${a.namespaceURI}|${a.localName}=${a.value} ${a.type} ${a.specified}`
      );
      const namespaces = event.namespaces.map((n) => `${n.prefix}=${n.namespaceURI}`);
      return [event.type, event.name.toString(), event.name.namespaceURI, attributes, namespaces];
    }
    case EventType.END_ELEMENT: {
      return [event.type, event.name.toString(), event.name.namespaceURI, event.namespaces.map((n) => n.prefix)];
    }
    case EventType.START_DOCUMENT: {
      return [event.type, event.version, event.encoding, event.standalone];
    }
    case EventType.PROCESSING_INSTRUCTION: {
      return [event.type, event.target, event.data];
    }
    case EventType.ENTITY_REFERENCE: {
      return [event.type, event.name, event.text];
    }
    case EventType.END_DOCUMENT: {
      return [event.type];
    }
    default: {
      return [event.type, 'text' in event ? event.text : ''];
    }
  }
}

describe('XMLEventFactory (StAX XMLEventFactory)', () => {
  it('makes start and end tags by name, or by prefix, namespace URI and local name', () => {
    const name = new QName('urn:p', 'a', 'p');
    const attribute = events.createAttribute('x', '1');
    const namespace = events.createNamespace('p', 'urn:p');
    expect(shown(events.createStartElement(name, [attribute], [namespace]))).toEqual([
      EventType.START_ELEMENT,
      'p:a',
      'urn:p',
      ['||x=1 CDATA true'],
      ['p=urn:p'],
    ]);
    expect(shown(events.createStartElement('q', 'urn:q', 'b'))).toEqual([
      EventType.START_ELEMENT,
      'q:b',
      'urn:q',
      [],
      [],
    ]);
    expect(shown(events.createEndElement(name, [namespace]))).toEqual([EventType.END_ELEMENT, 'p:a', 'urn:p', ['p']]);
    expect(shown(events.createEndElement('q', 'urn:q', 'b'))).toEqual([EventType.END_ELEMENT, 'q:b', 'urn:q', []]);
  });

  it('makes attributes by local name, by name, or by prefix, namespace URI and local name, and namespaces', () => {
    const byName = events.createAttribute(new QName('urn:p', 'x', 'p'), '2');
    const byParts = events.createAttribute('q', 'urn:q', 'y', '3');
    expect([byName.toString(), byName.namespaceURI, byName.value, byParts.toString(), byParts.namespaceURI]).toEqual([
      'p:x',
      'urn:p',
      '2',
      'q:y',
      'urn:q',
    ]);
    expect([events.createNamespace('urn:d'), events.createNamespace('p', 'urn:p')]).toEqual([
      { prefix: '', namespaceURI: 'urn:d' },
      { prefix: 'p', namespaceURI: 'urn:p' },
    ]);
  });

  it('makes the document, character data, comments, processing instructions and entity references', () => {
    expect([
      shown(events.createStartDocument('UTF-8', '1.1', true)),
      shown(events.createStartDocument()),
      shown(events.createEndDocument()),
      shown(events.createCharacters('t')),
      shown(events.createCData('c')),
      shown(events.createIgnorableSpace(' ')),
      shown(events.createComment('n')),
      shown(events.createProcessingInstruction('pi', 'd')),
      shown(events.createEntityReference('e', 'x')),
      shown(events.createEntityReference('f')),
    ]).toEqual([
      [EventType.START_DOCUMENT, '1.1', 'UTF-8', true],
      [EventType.START_DOCUMENT, undefined, undefined, undefined],
      [EventType.END_DOCUMENT],
      [EventType.CHARACTERS, 't'],
      [EventType.CDATA, 'c'],
      [EventType.SPACE, ' '],
      [EventType.COMMENT, 'n'],
      [EventType.PROCESSING_INSTRUCTION, 'pi', 'd'],
      [EventType.ENTITY_REFERENCE, 'e', 'x'],
      [EventType.ENTITY_REFERENCE, 'f', ''],
    ]);
  });

  it('places its events where setLocation says, or nowhere in particular', () => {
    const factory = new XMLEventFactory();
    expect(factory.createComment('a').location).toEqual({ line: 0, column: 0, offset: 0 });
    factory.setLocation({ line: 3, column: 2, offset: 10, systemId: 'file:///a.xml' });
    expect(factory.createComment('b').location).toEqual({ line: 3, column: 2, offset: 10, systemId: 'file:///a.xml' });
    factory.setLocation(undefined);
    expect(factory.createComment('c').location.line).toBe(0);
  });

  it('makes events of the same shape as the event reader’s, which a filter can mix', () => {
    const read = [...new XMLInputFactory().createEventReader('<a/>')].find(
      (event) => event.type === EventType.START_ELEMENT
    );
    const made = events.createStartElement('', '', 'a');
    expect(Object.getPrototypeOf(made)).toBe(Object.getPrototypeOf(read));
    expect([
      made.attribute('x'),
      events.createStartElement('', '', 'b', [events.createAttribute('x', '1')]).attribute('x')?.value,
    ]).toEqual([undefined, '1']);
  });
});
