import { describe, expect, it } from 'vitest';
import * as writer from '@/index';

describe('@exemplarjs/writer', () => {
  it('exports the factory, the writers, the SAX handler, the sinks, the encoder lookup, the character mapper and the errors, and nothing else at run time', () => {
    expect(Object.keys(writer).toSorted()).toEqual([
      'BytesSink',
      'EventWriter',
      'InvalidArgumentError',
      'StreamWriter',
      'StringSink',
      'WritableStreamSink',
      'WriterError',
      'WritingHandler',
      'XMLOutputFactory',
      'encoderFor',
      'mapCharacters',
    ]);
  });
});
