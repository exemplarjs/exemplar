import { describe, expect, it } from 'vitest';
import { XPathCompiler } from '@/index';
import { errorCode, strings } from '../helpers/evaluate.ts';
import { stringsBothWays } from '../helpers/resources.ts';

describe('for and let', () => {
  it('bind each item for for, and the whole value for let', () => {
    expect(strings('for $a in (1, 2), $b in (10, 20) return $a + $b')).toEqual(['11', '21', '12', '22']);
    expect(strings('let $a := (1, 2), $b := count($a) return $b')).toEqual(['2']);
    expect(strings('for $a in () return $a')).toEqual([]);
  });

  it('let an inner binding hide an outer one of the same name, and restore it after', () => {
    expect(strings('let $a := 1 return (let $a := 2 return $a, $a)')).toEqual(['2', '1']);
    expect(strings('for $x in (1, 2) return (for $x in ($x * 10) return $x)')).toEqual(['10', '20']);
  });

  it('resolve variable names with their prefixes', () => {
    expect(strings('let $p:a := 1 return $Q{urn:p}a', null, { namespaces: { p: 'urn:p' } })).toEqual(['1']);
  });

  it('raise XPST0008 for a variable that is not declared or out of scope', () => {
    expect(errorCode('$undeclared')).toBe('XPST0008');
    expect(errorCode('(let $a := 1 return $a, $a)')).toBe('XPST0008');
  });

  it('read declared variables from their slots', () => {
    const doubled = new XPathCompiler().compile('for $i in 1 to $n return $i * 2', { variables: { n: 'xs:integer' } });
    expect(doubled.evaluateStrings(null, { variables: { n: 3 } })).toEqual(['2', '4', '6']);
  });
});

describe('for and let that pause for a resource', () => {
  it('wait for each binding, and for the body for each item', async () => {
    const bound = [
      'for $i in (1, 2) return doc("u:" || $i || ".xml")/x/string()',
      'for $n in doc("u:" || "a.xml")//n, $m in ($n, $n) return string($m)',
      'let $b := doc("u:" || "b.xml") return string($b)',
    ].join(', ');
    expect(await stringsBothWays(bound)).toEqual([
      ['1', '2', '1', '1', '2', '2', '3'],
      ['1', '2', '1', '1', '2', '2', '3'],
    ]);
  });
});
