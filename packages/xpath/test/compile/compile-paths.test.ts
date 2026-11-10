import { describe, expect, it } from 'vitest';
import { elementRoot, errorCode, evaluate, LIBRARY, parse, strings } from '../helpers/evaluate.ts';
import { asyncErrorCode, PAUSING_DOCUMENTS, stringsBothWays } from '../helpers/resources.ts';

const DC = { namespaces: { dc: 'urn:dc' } };

describe('paths', () => {
  it('step along every axis from the context node', () => {
    expect(evaluate('/library/book', LIBRARY)).toEqual(['element book', 'element book']);
    expect(strings('//dc:title', LIBRARY, DC)).toEqual(['Dune', 'Emma']);
    expect(strings('//book/@id', LIBRARY)).toEqual(['b1', 'b2']);
    expect(evaluate('//price/parent::*/@id', LIBRARY)).toEqual(['attribute id', 'attribute id']);
    expect(strings('//book[2]/preceding-sibling::book/@id', LIBRARY)).toEqual(['b1']);
    expect(strings('(//price)[1]/following::dc:title', LIBRARY, DC)).toEqual(['Emma']);
    expect(evaluate('//price[1]/ancestor-or-self::*', LIBRARY)).toEqual([
      'element library',
      'element book',
      'element price',
      'element book',
      'element price',
    ]);
  });

  it('give reverse axes in document order, their predicates counting nearest first', () => {
    expect(strings('(//price)[2]/ancestor::*/name()', LIBRARY)).toEqual(['library', 'book']);
    expect(strings('(//price)[2]/ancestor::*[1]/@id', LIBRARY)).toEqual(['b2']);
    expect(strings('(//book)[2]/preceding::*[1]/name()', LIBRARY)).toEqual(['price']);
  });

  it('test names, wildcards and kinds', () => {
    expect(strings('//dc:*', LIBRARY, DC)).toEqual(['Dune', 'Emma']);
    expect(strings('//*:title', LIBRARY)).toEqual(['Dune', 'Emma']);
    expect(strings('//Q{urn:dc}title', LIBRARY)).toEqual(['Dune', 'Emma']);
    expect(evaluate('//comment()', LIBRARY)).toEqual(['comment']);
    expect(evaluate('//processing-instruction(pi)', LIBRARY)).toEqual(['processing-instruction pi']);
    expect(evaluate('/library/text()', LIBRARY)).toEqual(['text']);
    expect(evaluate('//element(price)', LIBRARY)).toEqual(['element price', 'element price']);
    expect(evaluate('//book/attribute(year)', LIBRARY)).toEqual(['attribute year']);
    expect(evaluate('//element(price, xs:string)', LIBRARY)).toEqual([]);
    expect(evaluate('self::document-node(element(library))', LIBRARY)).toEqual(['document']);
    expect(evaluate('/document-node()', LIBRARY)).toEqual([]);
    expect(evaluate('//nothing', LIBRARY)).toEqual([]);
  });

  it('test namespace nodes by prefix', () => {
    expect(strings('/library/namespace::dc', LIBRARY)).toEqual(['urn:dc']);
    expect(strings('/library/namespace::*/name()', LIBRARY)).toEqual(['xml', 'dc']);
    expect(evaluate('/library/namespace::p:dc', LIBRARY, { namespaces: { p: 'urn:p' } })).toEqual([]);
    expect(evaluate('/library/namespace-node()', LIBRARY)).toEqual(['namespace xml', 'namespace dc']);
  });

  it('take the default element namespace for unprefixed element names, but not attribute names', () => {
    const document = parse('<r xmlns="urn:d" a="1"><c/></r>');
    expect(evaluate('/r/c', document, { defaultElementNamespace: 'urn:d' })).toEqual(['element c']);
    expect(evaluate('/r/c', document)).toEqual([]);
    expect(strings('/*/@a', document, { defaultElementNamespace: 'urn:d' })).toEqual(['1']);
  });

  it('sort nodes into document order and remove duplicates', () => {
    expect(strings('(//book/.., //book)/name()', LIBRARY)).toEqual(['library', 'book', 'book']);
    expect(strings('//book/../@*', LIBRARY)).toEqual([]);
    expect(evaluate('(//price, //book)/..', LIBRARY)).toEqual(['element library', 'element book', 'element book']);
  });

  it('end with atomic values when the last step gives them', () => {
    expect(evaluate('//book/string(@id)', LIBRARY)).toEqual(['xs:string b1', 'xs:string b2']);
    expect(errorCode('//book/(@id, 1)', LIBRARY)).toBe('XPTY0018');
    expect(errorCode('(1, 2)/a', LIBRARY)).toBe('XPTY0019');
    expect(errorCode('//book/string(@id)/a', LIBRARY)).toBe('XPTY0019');
  });

  it('need a node as the context of a step and the root', () => {
    expect(errorCode('1!a')).toBe('XPTY0020');
    expect(errorCode('a')).toBe('XPDY0002');
    expect(errorCode('1!/')).toBe('XPTY0020');
    const element = evaluate('/', LIBRARY);
    expect(element).toEqual(['document']);
  });

  it('raise XPDY0050 for the root of a tree without a document', () => {
    expect(errorCode('/', elementRoot())).toBe('XPDY0050');
    expect(evaluate('root(.)', elementRoot())).toEqual(['element r']);
  });

  it('raise XPTY0018 for a step mixing nodes and atomic values, even when another step follows', () => {
    expect(errorCode('library/book/(., 1)/price', LIBRARY)).toBe('XPTY0018');
  });
});

describe('paths that pause for a resource', () => {
  it('wait for the start of a path, a step for each node, and predicates', async () => {
    const paths = [
      'doc("u:" || "a.xml")/a/n/string()',
      'doc("u:" || "a.xml")//n/doc("u:" || . || ".xml")/x/string()',
      'doc("u:" || "a.xml")//n[doc("u:" || . || ".xml") = 2]/string()',
      'doc("u:" || "a.xml")/a/n[doc("u:" || . || ".xml") = 2][1]/string()',
    ].join(', ');
    expect(await stringsBothWays(paths)).toEqual([
      ['1', '2', '1', '2', '2', '2'],
      ['1', '2', '1', '2', '2', '2'],
    ]);
  });

  it('raise XPTY0019 for a step on an item that is not a node', async () => {
    expect(await asyncErrorCode('(doc("u:" || "b.xml")/b/string())/x')).toBe('XPTY0019');
  });
});

describe('// written as the descendant axis', () => {
  const nested = parse('<a><b n="1"/><c><b n="2"/><b n="3"/></c></a>');

  it('keeps the child semantics of a positional predicate after //', () => {
    expect(strings('//b[1]/@n/string()', nested)).toEqual(['1', '2']);
    expect(strings('//b[last()]/@n/string()', nested)).toEqual(['1', '3']);
    expect(strings('//b[position() = 1]/@n/string()', nested)).toEqual(['1', '2']);
    expect(strings('//b[count(../b)]/@n/string()', nested)).toEqual(['1', '3']);
    expect(strings('//b[number(last()) = 2]/@n/string()', nested)).toEqual(['2', '3']);
  });

  it('keeps the child semantics of any positional predicate, by parent, at every depth', () => {
    const deep = parse(
      '<a><b n="1"><b n="2"/><b n="3"><b n="4"/></b></b><c><b n="5"/><x/><b n="6"/><b n="7"/></c><b n="8"/></a>'
    );
    const at = (expression: string, context = deep) => strings(`(${expression}) ! string(@n)`, context);
    expect(at('//b[1]')).toEqual(['1', '2', '4', '5']);
    expect(at('//b[last()]')).toEqual(['3', '4', '7', '8']);
    expect(at('//b[position() > 1]')).toEqual(['3', '6', '7', '8']);
    expect(at('//b[position() = last() - 1]')).toEqual(['1', '2', '6']);
    expect(at('//b[2], //b[3]')).toEqual(['3', '6', '8', '7']);
    expect(at('//b[@n > 2][1], //b[1][@n > 2]')).toEqual(['3', '4', '5', '8', '4', '5']);
    expect(at('let $i := 2 return //b[$i]')).toEqual(['3', '6', '8']);
    expect(at('//b[count(../b) = 3][position() mod 2 = 1]')).toEqual(['5', '7']);
    expect(strings('//*[1] ! name(), count(//node()[last()]), count(//text()[1])', deep)).toEqual([
      'a',
      'b',
      'b',
      'b',
      'b',
      '5',
      '0',
    ]);
    expect(at('//c//b[last()], //c/descendant-or-self::node()/b[2]', deep)).toEqual(['7', '6']);
    expect(at('/a/b[1]//b[1]', deep)).toEqual(['2', '4']);
  });

  it("finds the attributes below a node in one walk, filtering each element's as the attribute step does", () => {
    const tree = parse('<a n="1" m="0"><b n="2"><c n="3" m="4"/></b><!--x--><d m="5">t</d></a>');
    const names = (expression: string, context = tree) => strings(`(${expression}) ! (name() || "=" || .)`, context);
    expect(names('//@*')).toEqual(['n=1', 'm=0', 'n=2', 'n=3', 'm=4', 'm=5']);
    expect(names('//@n[. > 1], //@*[1], //@*[last()]')).toEqual([
      'n=2',
      'n=3',
      'n=1',
      'n=2',
      'n=3',
      'm=5',
      'm=0',
      'n=2',
      'm=4',
      'm=5',
    ]);
    expect(names('(//@m)[2], (//@*)[last()], /a/b//@*, /a/b/c//@m')).toEqual([
      'm=4',
      'm=5',
      'n=2',
      'n=3',
      'm=4',
      'm=4',
    ]);
    expect(names('//@n/..//@m, //b//@*[position() > 1]')).toEqual(['m=0', 'm=4', 'm=5', 'm=4']);
    expect(strings('count(//@*/..), count(//@x), count(//a/@n//@*)', tree)).toEqual(['4', '0', '0']);
    expect(strings('count(//(b, c)), count(/descendant-or-self::node()), (/a/b/c[1])[1]/@n/string()', tree)).toEqual([
      '2',
      '7',
      '3',
    ]);
  });

  it('keeps the child semantics when a predicate reaches position() or last() through function-lookup', () => {
    const position = "function-lookup(xs:QName('fn:position'), 0)()";
    expect(strings(`//b[${position} = 1]/@n/string()`, nested)).toEqual(['1', '2']);
    const last = "function-lookup(xs:QName('fn:last'), 0)()";
    expect(strings(`//b[${last} = 2]/@n/string()`, nested)).toEqual(['2', '3']);
  });

  it('gives the same nodes, in document order, for predicates that cannot depend on position', () => {
    expect(strings('//b/@n/string()', nested)).toEqual(['1', '2', '3']);
    expect(strings('//b[@n > 1]/@n/string()', nested)).toEqual(['2', '3']);
    expect(strings('//b[@n and true()]/@n/string()', nested)).toEqual(['1', '2', '3']);
    expect(strings('//b[contains(@n, "2")]/@n/string()', nested)).toEqual(['2']);
    expect(strings('//c//b/@n/string()', nested)).toEqual(['2', '3']);
    expect(strings('count(/a//b) + count(//c)', nested)).toEqual(['4']);
    expect(strings('//c[b/@n]/b[2]/@n/string()', nested)).toEqual(['3']);
    expect(strings('//b[innermost(.)]/@n/string()', nested)).toEqual(['1', '2', '3']);
    expect(errorCode('//b[error()]', nested)).toBe('FOER0000');
    expect(strings('//b[normalize-space(@n) != "2"][1]/@n/string(), //b[string(@n)][2]/@n/string()', nested)).toEqual([
      '1',
      '3',
      '3',
    ]);
  });
});

describe('a filter by a literal position on a path', () => {
  const nested = parse('<a><b n="1"/><c><b n="2"/><b n="3"/></c><c><b n="4"/></c></a>');

  it('picks the item at the position, from one node or from several', () => {
    expect(strings('(//b)[1]/@n/string(), (//b)[3]/@n/string(), (/a/c/b)[1]/@n/string()', nested)).toEqual([
      '1',
      '3',
      '2',
    ]);
    expect(strings('(//c/b)[3]/@n/string(), (//c/b)[2]/@n/string()', nested)).toEqual(['4', '3']);
    expect(strings('(//b[@n > 1])[1]/@n/string(), (//c/b/@n)[1]/string()', nested)).toEqual(['2', '2']);
    expect(strings('count((//b)[5]), count((//b)[0]), count((//c/b)[9]), count((//x)[1])', nested)).toEqual([
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(strings('(//b/ancestor::*)[1] ! name()', nested)).toEqual(['a']);
  });

  it('picks the last item with last()', () => {
    expect(strings('(//b)[last()]/@n/string(), //c/b[last()]/@n/string(), count(()[last()])', nested)).toEqual([
      '4',
      '3',
      '4',
      '0',
    ]);
    expect(strings('//b[last()]/ancestor::*[last()] ! name()', nested)).toEqual(['a']);
  });

  it('looks through filters that cannot depend on position, from one node or from several', () => {
    const at = (expression: string) => strings(`(${expression}) ! string(@n)`, nested);
    expect(at('(//b)[@n > 1][1], (//b)[@n > 1][@n < 4][2], (//b)[string(@n) = "4"][1]')).toEqual(['2', '3', '4']);
    expect(at('(//c/b)[@n > 2][1], (//c/b)[@n > 2][2], (//c/b)[@n > 9][1]')).toEqual(['3', '4']);
    expect(at('(//b)[position() > 1][1], (//b)[number(@n) - 1][1], (//b)[@n > 1][last()]')).toEqual(['2', '4']);
    expect(at('(//b)[normalize-space(@n)][3], (//b[normalize-space(@n)])[4]')).toEqual(['3', '4']);
    expect(errorCode('(//b)[xs:date(@n)][1]', nested)).toBe('FORG0001');
    expect(at('(//b[@n > 1])[2], (//c/b[@n > 1])[2], (//b[@n > 1][@n < 4])[2], (//b[position() > 1])[1]')).toEqual([
      '3',
      '3',
      '3',
      '3',
    ]);
  });

  it('waits for a path that pauses', async () => {
    expect(await stringsBothWays('(doc("u:" || "a.xml")/a/n)[2]/string()')).toEqual([['2'], ['2']]);
    const resources = { ...PAUSING_DOCUMENTS, 'u:at.xml': '<a x="1"><b x="2"/></a>' };
    const attributes = 'doc("u:" || "at.xml")//@x[doc("u:" || . || ".xml") = 2] ! string()';
    expect(await stringsBothWays(attributes, resources)).toEqual([['2'], ['2']]);
    const filtered = '(doc("u:" || "a.xml")/a/n)[doc("u:" || . || ".xml") = 2][1]/string()';
    expect(await stringsBothWays(filtered)).toEqual([['2'], ['2']]);
  });
});

describe('the count of a path', () => {
  const count = (expression: string) => strings(`count(${expression})`, LIBRARY)[0];

  it('counts the nodes on a step from one node', () => {
    expect(count('//book')).toBe('2');
    expect(count('/library/node()')).toBe('3');
    expect(count('/library/book[1]/@*')).toBe('2');
    expect(count('/library/book[1]/@id')).toBe('1');
    expect(count('/library/namespace::*')).toBe('2');
    expect(count('/library/book[1]/@id/ancestor::*')).toBe('2');
    expect(count('/library/self::library')).toBe('1');
    expect(count('/library/*:book')).toBe('2');
  });

  it('counts the nodes from several nodes, each once', () => {
    expect(count('//book/*')).toBe('4');
    expect(count('/library/book/ancestor::*')).toBe('1');
    expect(count('//book/@*')).toBe('3');
    expect(count('//book[@year]')).toBe('1');
  });

  it('counts the attributes below a node from their run in the tree', () => {
    expect([count('//@*'), count('//@id'), count('/library//@year'), count('//@nothing')]).toEqual([
      '3',
      '2',
      '1',
      '0',
    ]);
    expect([count('//book[1]/@id//@*'), count('//book//@*'), count('//book//@id')]).toEqual(['0', '3', '2']);
    expect(strings('/library/book ! count(.//@*), count(//self::book)', LIBRARY)).toEqual(['2', '1', '2']);
  });

  it('counts the nodes on a step from the context node', () => {
    expect(strings('/library/book ! count(*)', LIBRARY)).toEqual(['2', '2']);
  });

  it('waits for the steps before when they pause', async () => {
    expect(await stringsBothWays('count(doc("u:" || "a.xml")/a/n)')).toEqual([['2'], ['2']]);
    expect(await stringsBothWays('count(doc("u:" || "a.xml")/a/n/doc("u:" || . || ".xml")/x)')).toEqual([['2'], ['2']]);
  });

  it('raises XPTY0020 for a step from a context item that is not a node', () => {
    expect(errorCode('1 ! count(*)', LIBRARY)).toBe('XPTY0020');
  });
});

describe('a step after nodes that is not an axis step', () => {
  it('gives its items once each, and nothing when it gives none', () => {
    expect(strings('/library/book/(@id)', LIBRARY)).toEqual(['b1', 'b2']);
    expect(evaluate('/library/book/()', LIBRARY)).toEqual([]);
  });
});

describe('a step with a literal position', () => {
  it('picks the node at the position on its axis, in the axis order', () => {
    expect(strings('/library/book[2]/@id, /library/book[1]/*[2], //price/ancestor::*[2]/name()', LIBRARY)).toEqual([
      'b2',
      '12',
      'library',
    ]);
    expect(strings('/library/book[1]/@*[2], //book[1]/@id/ancestor::*[1]/@id', LIBRARY)).toEqual(['1965', 'b1']);
    expect(strings('/library/book[0], /library/book[3], /library/book[1][@id = "b2"]', LIBRARY)).toEqual([]);
    expect(strings('/library/book[2][@id = "b2"]/@id, /library/book[2][1]/@id', LIBRARY)).toEqual(['b2', 'b2']);
  });
});

describe('a step whose predicates read no position', () => {
  it('keeps the nodes that pass, in document order, on forward and reverse axes', () => {
    expect(strings('(//price)[2]/ancestor::*[exists(.)]/name(), //book[@year]/@id', LIBRARY)).toEqual([
      'library',
      'book',
      'b1',
    ]);
    expect(strings('//dc:*[. = "Emma"], //*:title[. != "Emma"]', LIBRARY, DC)).toEqual(['Emma', 'Dune']);
  });

  it('waits for predicates that pause', async () => {
    expect(await stringsBothWays('doc("u:" || "a.xml")/a/n[exists(doc("u:" || . || ".xml"))]/string()')).toEqual([
      ['1', '2'],
      ['1', '2'],
    ]);
  });
});

describe('steps that keep document order', () => {
  it('give the self, attribute and namespace nodes of nodes in order, each once', () => {
    expect(strings('//book/@*, //*/self::price', LIBRARY)).toEqual(['b1', '1965', 'b2', '12', '8.5']);
    expect(evaluate('/library/book/namespace::*', LIBRARY)).toHaveLength(4);
    expect(evaluate('(//price, //book)/self::*', LIBRARY)).toEqual([
      'element book',
      'element price',
      'element book',
      'element price',
    ]);
    expect(evaluate('//price/(/)', LIBRARY)).toEqual(['document']);
  });
});

describe('// and a step with only a literal position', () => {
  const nested = parse('<a><b><c n="1"/><c n="2"/></b><c n="3"/><d><c n="4"/></d></a>');

  it('gives the nth child of each node, in document order', () => {
    expect(strings('//*[2]/@n', nested)).toEqual(['2', '3']);
    expect(strings('//c[1]/@n, //c[2]/@n', nested)).toEqual(['1', '3', '4', '2']);
    expect(strings('//c[0], //c[3], //c[1][@n > 3]/@n', nested)).toEqual(['4']);
    expect(strings('//@n[. = "1"] ! count(.//*[1])', nested)).toEqual(['0']);
  });
});
