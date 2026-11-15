import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, evaluate, parse, strings } from '../helpers/evaluate.ts';
import { stringsBothWays } from '../helpers/resources.ts';

const nested = parse('<a n="0"><b n="1"><b n="2"><c n="3"/></b><c n="4"/></b><b n="5"/><c n="6"/></a>');

describe('paths on node numbers', () => {
  it('give the nodes of steps from several nodes in document order, each once', () => {
    expect(strings('//b/ancestor-or-self::*/@n', nested)).toEqual(['0', '1', '2', '5']);
    expect(strings('//b/following-sibling::*/@n', nested)).toEqual(['4', '5', '6']);
    expect(strings('//c/preceding::b/@n', nested)).toEqual(['1', '2', '5']);
    expect(strings('count(//b/*), count(//b//c), count(/a/b/b/c), count(/a/none/b/c)', nested)).toEqual([
      '3',
      '2',
      '1',
      '0',
    ]);
  });

  it('take a literal position from each node, nothing before the first', () => {
    expect(strings('/a/*/*[1]/@n, //b/c[1]/@n', nested)).toEqual(['2', '3', '4']);
    expect(strings('/a/b/*[0], //b/*[9]', nested)).toEqual([]);
    expect(strings('//b/ancestor::*[1]/@n', nested)).toEqual(['0', '1']);
  });

  it('refine wildcard tests on each node', () => {
    expect(strings('/a/*:c[1]/@n, //*:c[1]/@n, /a/b/*:c[1]/@n', nested)).toEqual(['6', '3', '4', '6', '4']);
    expect(strings('//b//c[1]/@n', nested)).toEqual(['3', '4']);
  });

  it('test conditions on each node', () => {
    expect(strings('/a/b[@n < 2]/*[@n]/@n, //b/c[. = ""]/@n', nested)).toEqual(['2', '4', '3', '4']);
  });

  it('read the attributes of nodes, and of whole subtrees after `//`, each once', () => {
    expect(strings('/a/b/@n, //b//@n', nested)).toEqual(['1', '5', '1', '2', '3', '4', '5']);
    expect(strings('count(/a//@*), count(/a/b//@n[. > 2]), count(/a/b/b//@*), count(/a/none//@*)', nested)).toEqual([
      '7',
      '3',
      '2',
      '0',
    ]);
    expect(strings('/a/b//@*[. = "3"]', nested)).toEqual(['3']);
  });

  it('stop at the first node when that is all that is asked', () => {
    expect(strings('exists(/a/b//c), head(//b/*)/@n, (/a/b/*)[2]/@n', nested)).toEqual(['true', '2', '4']);
  });

  it('step node by node when the first step does not give tree nodes of one tree', () => {
    expect([evaluate('()/a/b'), evaluate('()/(.)'), strings('exists(()/a/b)')]).toEqual([[], [], ['false']]);
    expect(strings('(/a/@n, //b/b)/ancestor::*/@n', nested)).toEqual(['0', '1']);
    expect(errorCode('(1, 2)/a/b', nested)).toBe('XPTY0019');
    const other = parse('<z><y/></z>');
    const across = new XPathCompiler().compile('(/a, $other/z)/*/name()', { variables: ['other'] });
    expect(across.evaluateStrings(nested, { variables: { other } })).toEqual(['b', 'b', 'c', 'y']);
  });
});

describe('paths on node numbers after a first step that pauses', () => {
  it('wait for that step, then run on numbers', async () => {
    const resources = { 'u:a.xml': '<a><b><c n="1"/><c n="2"/></b><b><c n="3"/></b></a>' };
    expect(
      await stringsBothWays('doc("u:" || "a.xml")//c[1]/@n ! string(), count(doc("u:" || "a.xml")/a/b/c)', resources)
    ).toEqual([
      ['1', '3', '3'],
      ['1', '3', '3'],
    ]);
  });
});
