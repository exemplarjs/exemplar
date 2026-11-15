import { describe, expect, it } from 'vitest';
import { xdmError } from '@/errors';
import { XPathErrorCode, XdmError } from '@/index';

describe('xdmError', () => {
  it('throws an XdmError with its code in the message, without a stack trace', () => {
    let caught: unknown;
    try {
      xdmError(XPathErrorCode.TYPE_MISMATCH, 'bad');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(XdmError);
    expect((caught as XdmError).code).toBe('XPTY0004');
    expect((caught as XdmError).message).toBe('XPTY0004: bad');
    expect((caught as XdmError).name).toBe('XdmError');
  });
});
