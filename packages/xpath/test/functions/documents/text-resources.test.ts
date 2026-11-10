import { describe, expect, it } from 'vitest';
import { type EvaluationOptions, XPathCompiler, XPathException } from '@/index';
import { readingWith, resolverOf } from '../../helpers/resources.ts';

const BASE = 'http://example.org/text/';
const compiler = new XPathCompiler({ baseURI: BASE });

/** Evaluates an expression with options, giving each item's string value. */
function strings(expression: string, options: EvaluationOptions = {}): string[] {
  return compiler.compile(expression).evaluateStrings(null, options);
}

/** The code of the error an expression raises with options. */
function errorCode(expression: string, options: EvaluationOptions = {}): string | undefined {
  try {
    compiler.compile(expression).evaluate(null, options);
    return undefined;
  } catch (error) {
    if (error instanceof XPathException) return error.code;
    throw error;
  }
}

/** Bytes from a list of byte values. */
const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

const texts = readingWith(
  resolverOf({
    [`${BASE}plain.txt`]: { bytes: new TextEncoder().encode('caf\u00E9\n') },
    [`${BASE}bom.txt`]: { bytes: bytes(0xef, 0xbb, 0xbf, 0x61) },
    [`${BASE}le.txt`]: { bytes: bytes(0xff, 0xfe, 0x61, 0x00) },
    [`${BASE}be.txt`]: { bytes: bytes(0xfe, 0xff, 0x00, 0x61) },
    [`${BASE}latin.txt`]: { bytes: bytes(0x63, 0x61, 0x66, 0xe9, 0x80) },
    [`${BASE}latin-labelled.txt`]: { bytes: bytes(0xe9), encoding: 'ISO-8859-1' },
    [`${BASE}declared.xml`]: {
      bytes: new TextEncoder().encode('<?xml version="1.0" encoding="iso-8859-1"?><a>\u00FF</a>'),
    },
    [`${BASE}invalid.txt`]: { bytes: bytes(0xc3, 0x28) },
    [`${BASE}control.txt`]: '\u0001',
    [`${BASE}lines.txt`]: 'one\r\ntwo\rthree\n\nfive\n',
    [`${BASE}data.json`]: '{"a": [1, true], "a": 2}',
  })
);

const ascii = readingWith(resolverOf({ [`${BASE}plain.txt`]: { bytes: bytes(0x61) } }));

describe('unparsed-text', () => {
  it('reads a resource as text, in UTF-8 by default, its URI made absolute against the static base URI', () => {
    expect(strings('unparsed-text("plain.txt")', texts)).toEqual(['caf\u00E9\n']);
    expect(strings(`unparsed-text("${BASE}plain.txt")`, texts)).toEqual(['caf\u00E9\n']);
  });

  it('leaves out a byte order mark, which settles UTF-16 byte order', () => {
    expect(strings('unparsed-text("bom.txt"), unparsed-text("le.txt"), unparsed-text("be.txt")', texts)).toEqual([
      'a',
      'a',
      'a',
    ]);
    expect(strings('unparsed-text("be.txt", "utf-16")', texts)).toEqual(['a']);
  });

  it('decodes in the encoding the resource names, else the one asked for, else the one an XML declaration names', () => {
    expect(strings('unparsed-text("latin-labelled.txt", "utf-8")', texts)).toEqual(['\u00E9']);
    expect(strings('unparsed-text("latin.txt", "iso-8859-1")', texts)).toEqual(['caf\u00E9\u0080']);
    expect(strings('unparsed-text("declared.xml")', texts)).toEqual([
      '<?xml version="1.0" encoding="iso-8859-1"?><a>\u00C3\u00BF</a>',
    ]);
    expect(strings('unparsed-text("plain.txt", "windows-1252")', texts)).toEqual(['caf\u00C3\u00A9\n']);
  });

  it('raises FOUT1190 for text that does not decode, an encoding it does not know, or a character XML cannot hold', () => {
    expect(errorCode('unparsed-text("invalid.txt")', texts)).toBe('FOUT1190');
    expect(errorCode('unparsed-text("latin.txt", "us-ascii")', texts)).toBe('FOUT1190');
    expect(errorCode('unparsed-text("plain.txt", "no-such-encoding")', texts)).toBe('FOUT1190');
    expect(errorCode('unparsed-text("latin-labelled.txt", "123")', texts)).toBe('FOUT1190');
    expect(strings('unparsed-text-available("latin-labelled.txt", "123")', texts)).toEqual(['false']);
    expect(errorCode('unparsed-text("control.txt")', texts)).toBe('FOUT1190');
    expect(strings('unparsed-text("plain.txt", "ascii")', ascii)).toEqual(['a']);
  });

  it('raises FOUT1170 for a URI that is not valid, has a fragment, or names nothing a resolver supplies', () => {
    expect(errorCode('unparsed-text("%zz")', texts)).toBe('FOUT1170');
    expect(errorCode('unparsed-text("plain.txt#top")', texts)).toBe('FOUT1170');
    expect(errorCode('unparsed-text("missing.txt")', texts)).toBe('FOUT1170');
    expect(errorCode('unparsed-text("plain.txt")')).toBe('FOUT1170');
  });

  it('gives the empty sequence for the empty sequence', () => {
    expect(strings('count(unparsed-text(())), count(unparsed-text((), "utf-8"))', texts)).toEqual(['0', '0']);
  });
});

describe('unparsed-text-lines', () => {
  it('splits text at each line feed, carriage return, or both, without an empty last line', () => {
    expect(strings('unparsed-text-lines("lines.txt")', texts)).toEqual(['one', 'two', 'three', '', 'five']);
    expect(strings('unparsed-text-lines("plain.txt")', ascii)).toEqual(['a']);
    expect(strings('count(unparsed-text-lines(())), count(unparsed-text-lines("plain.txt", "utf-8"))', texts)).toEqual([
      '0',
      '1',
    ]);
  });
});

describe('unparsed-text-available', () => {
  it('tells whether unparsed-text would give text', () => {
    expect(
      strings(
        'unparsed-text-available("plain.txt"), unparsed-text-available("missing.txt"), unparsed-text-available("invalid.txt"), unparsed-text-available(())',
        texts
      )
    ).toEqual(['true', 'false', 'false', 'false']);
    expect(strings('unparsed-text-available("latin.txt", "us-ascii")', texts)).toEqual(['false']);
  });
});

describe('json-doc', () => {
  it('reads a resource as JSON, as parse-json reads text, with its options', () => {
    expect(strings('json-doc("data.json")?a?*', texts)).toEqual(['1', 'true']);
    expect(errorCode('json-doc("data.json", map { "duplicates": "reject" })', texts)).toBe('FOJS0003');
    expect(strings('count(json-doc(()))', texts)).toEqual(['0']);
  });

  it('raises FOUT1170 for a resource it cannot read', () => {
    expect(errorCode('json-doc("missing.json")', texts)).toBe('FOUT1170');
  });
});
