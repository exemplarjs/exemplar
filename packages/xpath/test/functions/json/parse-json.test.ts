import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';
import { readingWith, resolverOf } from '../../helpers/resources.ts';

/** The start of a `\uXXXX` escape, kept apart so that escapes stay as written. */
const U = String.raw`\u`;

describe('parse-json', () => {
  it('reads JSON values as XPath values', () => {
    expect(evaluate(`parse-json('{"a": 1}'), parse-json('[1, "x"]'), parse-json('"x"')`)).toEqual([
      'map(1)',
      'array(2)',
      'xs:string x',
    ]);
    expect(evaluate(`parse-json('-1.5e2'), parse-json('true'), parse-json('false')`)).toEqual([
      'xs:double -150',
      'xs:boolean true',
      'xs:boolean false',
    ]);
  });

  it('reads null as the empty sequence, also inside arrays and objects', () => {
    expect(evaluate(`parse-json('null')`)).toEqual([]);
    expect(strings(`array:size(parse-json('[null, 1]')), empty(parse-json('[null]')?1)`)).toEqual(['2', 'true']);
    expect(strings(`map:contains(parse-json('{"a": null}'), 'a'), empty(parse-json('{"a": null}')?a)`)).toEqual([
      'true',
      'true',
    ]);
  });

  it('reads nested values', () => {
    expect(strings(`parse-json('{"a": [{"b": [true]}]}')?a?1?b?1`)).toEqual(['true']);
  });

  it('gives the empty sequence for the empty sequence', () => {
    expect(evaluate('parse-json(())')).toEqual([]);
    expect(evaluate(`parse-json((), map {'duplicates': 'reject'})`)).toEqual([]);
  });

  it('raises FOJS0001 for JSON nested deeper than it reads, as parse-json and json-to-xml do', () => {
    const deep = (depth: number): string => `${'['.repeat(depth)}${']'.repeat(depth)}`;
    const read = new XPathCompiler().compile('count(parse-json($j)), count(json-to-xml($j))', { variables: ['j'] });
    expect(read.evaluateStrings(null, { variables: { j: deep(500) } })).toEqual(['1', '1']);
    expect(() => read.evaluate(null, { variables: { j: deep(100_000) } })).toThrow('FOJS0001');
  });

  it('treats a character XML cannot hold alike, written as itself or escaped', () => {
    const read = (options: string): string[] =>
      new XPathCompiler()
        .compile(`string-to-codepoints(parse-json($j, ${options}))`, { variables: ['j'] })
        .evaluateStrings(null, { variables: { j: `"a${String.fromCodePoint(0xff_fe)}"` } });
    expect(read('map {}')).toEqual(['97', '65533']);
    expect(read("map { 'escape': true() }")).toEqual(['97', '92', '117', '70', '70', '70', '69']);
    expect(read("map { 'fallback': function($s) { $s } }")).toEqual(['97', '92', '117', '70', '70', '70', '69']);
  });

  it('raises FOJS0001 for text that is not JSON', () => {
    expect(errorCode(`parse-json('[1,]')`)).toBe('FOJS0001');
    expect(errorCode(`parse-json('')`)).toBe('FOJS0001');
    expect(errorCode(`parse-json("{'a': 1}")`)).toBe('FOJS0001');
  });

  it('keeps the first of duplicate keys by default, or the last, or rejects them', () => {
    expect(strings(`parse-json('{"a": 1, "a": 2}')?a`)).toEqual(['1']);
    expect(strings(`parse-json('{"a": 1, "a": 2}', map {'duplicates': 'use-first'})?a`)).toEqual(['1']);
    expect(strings(`parse-json('{"a": 1, "a": 2}', map {'duplicates': 'use-last'})?a`)).toEqual(['2']);
    expect(errorCode(`parse-json('{"a": 1, "a": 2}', map {'duplicates': 'reject'})`)).toBe('FOJS0003');
    expect(errorCode(`parse-json('{"a": 1, "b": 2}', map {'duplicates': 'reject'})`)).toBeUndefined();
  });

  it('compares keys after decoding escapes', () => {
    expect(errorCode(`parse-json('{"%": 1, "${U}0025": 2}', map {'duplicates': 'reject'})`)).toBe('FOJS0003');
    expect(errorCode(`parse-json('{"/": 1, "\\/": 2}', map {'escape': true(), 'duplicates': 'reject'})`)).toBe(
      'FOJS0003'
    );
  });

  it('decodes escapes, replacing characters XML cannot hold with U+FFFD', () => {
    expect(strings(`string-to-codepoints(parse-json('"\\r\\t${U}0041"'))`)).toEqual(['13', '9', '65']);
    expect(strings(`parse-json('["${U}0000", "${U}dead", "\\b"]')?* ! string-to-codepoints(.)`)).toEqual([
      '65533',
      '65533',
      '65533',
    ]);
  });

  it('keeps escapes when escape is true', () => {
    expect(strings(`parse-json('["\\r", "${U}0000", "\\\\", "${U}0025"]', map {'escape': true()})?*`)).toEqual([
      String.raw`\r`,
      `${U}0000`,
      String.raw`\\`,
      '%',
    ]);
    expect(strings(`map:keys(parse-json('{"\\\\": 1}', map {'escape': true()}))`)).toEqual([String.raw`\\`]);
  });

  it('decodes escapes when escape is false', () => {
    expect(strings(`string-to-codepoints(parse-json('"\\r"', map {'escape': false()}))`)).toEqual(['13']);
  });

  it('replaces characters XML cannot hold with what the fallback gives for their escape', () => {
    expect(strings(`parse-json('"${U}FFFF"', map {'fallback': lower-case#1})`)).toEqual([`${U}ffff`]);
    expect(strings(`map:keys(parse-json('{"${U}DEAD": 1}', map {'fallback': lower-case#1}))`)).toEqual([`${U}dead`]);
    expect(strings(`parse-json('"a\\bc"', map {'fallback': function($s) {'[' || $s || ']'}})`)).toEqual([
      String.raw`a[\b]c`,
    ]);
  });

  it('accepts liberal, and ignores options it does not know', () => {
    expect(strings(`parse-json('[1]', map {'liberal': true()})?1`)).toEqual(['1']);
    expect(strings(`parse-json('[1]', map {'liberal': false(), 'spec': 'RFC4627'})?1`)).toEqual(['1']);
  });

  it('raises FOJS0005 for a duplicates value it does not know, or escape with a fallback', () => {
    expect(errorCode(`parse-json('[1]', map {'duplicates': 'retain'})`)).toBe('FOJS0005');
    expect(errorCode(`parse-json('[1]', map {'escape': true(), 'fallback': lower-case#1})`)).toBe('FOJS0005');
  });

  it('accepts a fallback with escape false', () => {
    expect(strings(`parse-json('"${U}FFFF"', map {'escape': false(), 'fallback': upper-case#1})`)).toEqual([
      String.raw`\UFFFF`,
    ]);
  });

  it('raises XPTY0004 for options of the wrong type', () => {
    expect(errorCode(`parse-json('[1]', map {'liberal': 'yes'})`)).toBe('XPTY0004');
    expect(errorCode(`parse-json('[1]', map {'escape': 1})`)).toBe('XPTY0004');
    expect(errorCode(`parse-json('[1]', map {'duplicates': 1})`)).toBe('XPTY0004');
    expect(errorCode(`parse-json('[1]', map {'fallback': lower-case('a')})`)).toBe('XPTY0004');
    expect(errorCode(`parse-json('[1]', map {'fallback': concat#2})`)).toBe('XPTY0004');
  });
});

describe('parse-json with a fallback that pauses for a resource', () => {
  it('raises a TypeError, as a fallback must answer at once', async () => {
    const parse = new XPathCompiler().compile(
      String.raw`parse-json('"\u0000"', map { "fallback": function($s) { doc("u:" || "b.xml")/b/string() } })`
    );
    const options = readingWith(resolverOf({ 'u:b.xml': '<b>3</b>' }, true));
    await expect(parse.evaluateAsync(null, options)).rejects.toThrow(TypeError);
  });
});
