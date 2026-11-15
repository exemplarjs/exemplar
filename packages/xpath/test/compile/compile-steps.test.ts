import { describe, expect, it } from 'vitest';
import { evaluate, LIBRARY, parse, strings } from '../helpers/evaluate.ts';
import { stringsBothWays } from '../helpers/resources.ts';

const DC = { namespaces: { dc: 'urn:dc' } };

describe('axis steps with conditions', () => {
  it('walk reverse axes from attributes and keep the nodes that pass', () => {
    expect(strings('//book[1]/@id ! ancestor::*[exists(@id)]/name()', LIBRARY)).toEqual(['book']);
    expect(strings('//book[1]/@id ! ancestor-or-self::node()[self::*]/name()', LIBRARY)).toEqual(['library', 'book']);
  });

  it('give no attributes of nodes other than elements', () => {
    expect(strings('/library/text() ! (count(@*), exists(@*[. = "x"]))', LIBRARY)).toEqual(['0', 'false']);
  });

  it('read attributes by any name, by kind, or by a name', () => {
    expect(strings('//book[1] ! (count(@*), count(attribute::node()), count(@id))', LIBRARY)).toEqual(['2', '2', '1']);
  });

  it('filter by a wildcard test as they read', () => {
    expect(strings('exists(//dc:*), count(/library/*/dc:*[. != ""])', LIBRARY, DC)).toEqual(['true', '2']);
    expect(strings('/library/book[1] ! exists(dc:*)', LIBRARY, DC)).toEqual(['true']);
  });
});

describe('axis steps with a literal position', () => {
  it('read the axis only as far as the position, nothing before the first', () => {
    expect(strings('/library ! (book[1]/@id, book[0], book[5])', LIBRARY)).toEqual(['b1']);
    expect(strings('//price ! ancestor::*[2]/name()', LIBRARY)).toEqual(['library', 'library']);
    expect(strings('/library ! *:book[2]/@id', LIBRARY)).toEqual(['b2']);
  });

  it('then apply the predicates after it, waiting for those that pause', async () => {
    expect(strings('/library ! book[2][@id = "b2"]/@id', LIBRARY)).toEqual(['b2']);
    expect(await stringsBothWays('doc("u:" || "a.xml")/a ! n[1][exists(doc("u:" || . || ".xml"))]/string()')).toEqual([
      ['1'],
      ['1'],
    ]);
  });
});

describe('axis steps with predicates that read positions', () => {
  it('see a reverse axis nearest first, then give its nodes in document order', () => {
    expect(strings('(//price)[1] ! ancestor::*[position() < 3]/name()', LIBRARY)).toEqual(['library', 'book']);
  });

  it('filter by a wildcard test before the predicates', () => {
    expect(strings('count(/library/*:book[position() > 0]) = count(/library/book)', LIBRARY)).toEqual(['true']);
  });
});

describe('the stream of a short path from one node', () => {
  const books = 'let $book := /library/book[1] return ';

  it('reads the last step from the node, by its conditions, a position, or other predicates', () => {
    expect(
      strings(`${books}(exists($book/*[@id]), count($book/*[1]), count($book/*[position() > 1]))`, LIBRARY)
    ).toEqual(['false', '1', '1']);
  });

  it('reads the steps node by node from several nodes', () => {
    expect(strings('let $books := //book return count($books/*)', LIBRARY)).toEqual(['4']);
  });
});

describe('a path of one step after `//` is rewritten', () => {
  it('is that step', () => {
    expect(evaluate('/library ! descendant-or-self::node()/price', LIBRARY)).toEqual([
      'element price',
      'element price',
    ]);
  });
});

describe('grouped `//` steps with positional predicates', () => {
  it('filter by a wildcard test, and wait for predicates that pause', async () => {
    expect(strings('//dc:*[last()]', LIBRARY, DC)).toEqual(['Dune', 'Emma']);
    const nested = parse('<a><b n="1" m="2"/><b n="3"/></a>');
    expect(strings('//@*[last()]', nested)).toEqual(['2', '3']);
    const resources = { 'u:a.xml': '<a><n x="1"/><n x="2"/></a>', 'u:1.xml': '<x/>', 'u:2.xml': '<x/>' };
    expect(
      await stringsBothWays('doc("u:" || "a.xml")//@x[exists(doc("u:" || . || ".xml"))][1] ! string()', resources)
    ).toEqual([
      ['1', '2'],
      ['1', '2'],
    ]);
  });
});
