import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from '@exemplarjs/xml';
import { ErrorCode } from '@exemplarjs/xml';
import { encoderFor } from '@/encoders';
import { WriterError } from '@/error';
import { StringSink, XMLOutputFactory } from '@/index';

describe('WriterError', () => {
  it('is an Error with a name, a message and a stable code', () => {
    const error = new WriterError(ErrorCode.WRITE_NAME, '1a is not a local name');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WriterError');
    expect(error.message).toBe('1a is not a local name');
    expect(error.code).toBe('WRITE_NAME');
  });

  // Engines without `Error.stackTraceLimit` keep their stacks.
  it.runIf(Error.stackTraceLimit !== undefined)(
    'is thrown by the writer without stack frames, as its other errors are',
    () => {
      const noFrames = (error: unknown): boolean => !/\n\s+at |@/.test((error as Error).stack ?? '');
      /** The error a call throws. */
      const thrown = (call: () => unknown): unknown => {
        try {
          call();
        } catch (error) {
          return error;
        }
        return undefined;
      };
      const writer = new XMLOutputFactory().createStreamWriter(new StringSink());
      const badName = thrown(() => writer.writeStartElement('1a'));
      const unknownEncoding = thrown(() => encoderFor('no-such-encoding'));
      expect([badName instanceof WriterError, unknownEncoding instanceof InvalidArgumentError]).toEqual([true, true]);
      expect([noFrames(badName), noFrames(unknownEncoding)]).toEqual([true, true]);
    }
  );
});
