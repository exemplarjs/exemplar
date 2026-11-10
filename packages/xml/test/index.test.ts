import { describe, expect, it } from 'vitest';
import * as exemplar from '@/index';

describe('@exemplarjs/xml', () => {
  it('exports the reading API and nothing internal', () => {
    expect(Object.keys(exemplar).toSorted()).toEqual([
      'AsyncEventReader',
      'AsyncReaderRequiredError',
      'Attribute',
      'DEFAULT_LIMITS',
      'ErrorCode',
      'EventReader',
      'EventType',
      'IllegalStateError',
      'InvalidArgumentError',
      'QName',
      'ResolutionError',
      'XMLError',
      'XMLEventFactory',
      'XMLInputFactory',
      'XMLNS_NAMESPACE',
      'XML_NAMESPACE',
    ]);
  });

  it('reads a document through what it exports', () => {
    const reader = new exemplar.XMLInputFactory().createStreamReader('<a/>');
    expect(reader.next()).toBe(exemplar.EventType.START_ELEMENT);
    expect(exemplar.ErrorCode.WF_SECOND_ROOT).toBe('WF_SECOND_ROOT');
  });
});
