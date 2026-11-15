import { describe, expect, it } from 'vitest';
import * as sax from '@/index';

describe('@exemplarjs/sax', () => {
  it('exports the parser, the filter base class and the attribute list, and nothing else at run time', () => {
    expect(Object.keys(sax).toSorted()).toEqual(['AttributesImpl', 'SAXParser', 'XMLFilterImpl']);
    expect(new sax.SAXParser()).toBeInstanceOf(sax.SAXParser);
    expect(new sax.XMLFilterImpl().handler).toEqual({});
  });
});
