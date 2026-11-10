import { describe, expect, it } from 'vitest';
import { parseJson } from '@/functions/json/json-parser';
import { XPathException } from '@/index';

/** A decoder that keeps the raw text between the quotes. */
const raw = (text: string): string => text;

/** The code of the error parsing some text raises. */
function failure(text: string): string | undefined {
  try {
    parseJson(text, raw);
    return undefined;
  } catch (error) {
    if (error instanceof XPathException) return error.code;
    throw error;
  }
}

describe('the JSON parser', () => {
  it('reads each kind of value at the top', () => {
    expect(parseJson('"a"', raw)).toEqual({ kind: 'string', text: 'a' });
    expect(parseJson('-1.5e+3', raw)).toEqual({ kind: 'number', text: '-1.5e+3' });
    expect(parseJson('true', raw)).toEqual({ kind: 'boolean', value: true });
    expect(parseJson('false', raw)).toEqual({ kind: 'boolean', value: false });
    expect(parseJson('null', raw)).toEqual({ kind: 'null' });
  });

  it('reads objects and arrays, empty or not, with whitespace around tokens', () => {
    expect(parseJson(' { } ', raw)).toEqual({ kind: 'object', entries: [] });
    expect(parseJson('[ ]', raw)).toEqual({ kind: 'array', members: [] });
    expect(parseJson('\t{ "a" : [ 1 , null ] ,\r\n"b":{}}\n', raw)).toEqual({
      kind: 'object',
      entries: [
        { key: 'a', value: { kind: 'array', members: [{ kind: 'number', text: '1' }, { kind: 'null' }] } },
        { key: 'b', value: { kind: 'object', entries: [] } },
      ],
    });
  });

  it('passes the raw text of strings and keys to the decoder', () => {
    const seen: string[] = [];
    parseJson(String.raw`{"k\n": "vA"}`, (text) => {
      seen.push(text);
      return text.toUpperCase();
    });
    expect(seen).toEqual([String.raw`k\n`, String.raw`vA`]);
  });

  it('rejects text that is not JSON', () => {
    for (const text of ['', ' ', 'nul', 'tru', 'fals', '01', '1.', '.5', '+1', '-', 'x', '[1,]', '[1 2]', '{"a"}']) {
      expect(failure(text), text).toBe('FOJS0001');
    }
    for (const text of ['{a:1}', '{"a":1,}', '{"a":1', '[1', '"abc', '"\t"', String.raw`"\x"`, String.raw`"\u12"`]) {
      expect(failure(text), text).toBe('FOJS0001');
    }
    expect(failure('1 2')).toBe('FOJS0001');
    expect(failure('{} x')).toBe('FOJS0001');
  });

  it('says where the text goes wrong', () => {
    expect(() => parseJson('[1, x]', raw)).toThrow('Expected a JSON value at offset 4 of the JSON text');
  });
});
