import { describe, expect, it } from 'vitest';
import { errorCode } from '../../helpers/evaluate.ts';

describe('functions of other languages', () => {
  it('raise FOQM0006 and FOXT0004, there being no XQuery or XSLT processor', () => {
    expect(errorCode('load-xquery-module("urn:m")')).toBe('FOQM0006');
    expect(errorCode('load-xquery-module("urn:m", map {})')).toBe('FOQM0006');
    expect(errorCode('transform(map {})')).toBe('FOXT0004');
  });
});
