import { describe, expect, it } from 'vitest';
import { parseXPath } from '@/internal';
import { explicit, parseErrorOf, shape } from '../helpers/syntax.ts';

describe('paths', () => {
  it('expand the abbreviations', () => {
    expect(explicit('a/@b/../.')).toBe('child::a/attribute::b/parent::node()/.');
    expect(explicit('a//b')).toBe('child::a/descendant-or-self::node()/child::b');
    expect(explicit('//b')).toBe('/descendant-or-self::node()/child::b');
    expect(explicit('/a')).toBe('/child::a');
  });

  it('read every axis', () => {
    const axes = [
      'child',
      'descendant',
      'attribute',
      'self',
      'descendant-or-self',
      'following-sibling',
      'following',
      'namespace',
    ];
    const reverse = ['parent', 'ancestor', 'preceding-sibling', 'preceding', 'ancestor-or-self'];
    for (const axis of [...axes, ...reverse]) expect(explicit(`${axis} :: x`)).toBe(`${axis}::x`);
    expect(parseErrorOf('sideways::x')?.message).toBe(
      'XPST0003: Expected an axis name, but found "sideways" at line 1, column 1'
    );
    expect(parseErrorOf('a:child::x')?.code).toBe('XPST0003');
  });

  it('give a step without an axis the attribute axis for attribute tests and the namespace axis for namespace-node()', () => {
    expect(explicit('attribute()/schema-attribute(a)')).toBe('attribute::attribute()/attribute::schema-attribute(a)');
    expect(explicit('namespace-node()')).toBe('namespace::namespace-node()');
    expect(explicit('text()/node()/element()')).toBe('child::text()/child::node()/child::element()');
  });

  it('read name tests and wildcards', () => {
    expect(explicit('a/p:b/Q{u}c/*/p:*/Q{u}*/*:d')).toBe(
      'child::a/child::p:b/child::Q{u}c/child::*/child::p:*/child::Q{u}*/child::*:d'
    );
    expect(explicit('@*')).toBe('attribute::*');
    expect(parseErrorOf('child::1')?.message).toBe(
      'XPST0003: Expected a name test or kind test, but found "1" at line 1, column 8'
    );
  });

  it('take a lone slash as the root only when no relative path follows it', () => {
    expect(explicit('/')).toBe('/');
    expect(explicit('(/) * 5')).toBe('(/) * 5');
    expect(explicit('/ = 1')).toBe('(/) = 1');
    expect(parseErrorOf('/ * 5')?.message).toBe(
      'XPST0003: Expected an operator or the end of the expression, but found "5" at line 1, column 5'
    );
    expect(explicit('/ div')).toBe('/child::div');
  });

  it('keep predicates on steps apart from filters on expressions', () => {
    expect(explicit('a[1][2]')).toBe('child::a[1][2]');
    expect(explicit('(a)[1]')).toBe('(child::a)[1]');
    expect(explicit('a/(b)[1]')).toBe('child::a/(child::b)[1]');
    expect(shape(parseXPath('preceding::a[1]'))).not.toEqual(shape(parseXPath('(preceding::a)[1]')));
  });

  it('take any postfix expression as a step', () => {
    expect(explicit('$a/f()/(b, c)/"s"/.?k')).toBe('$a/f()/(child::b, child::c)/"s"/.?("k")');
  });

  it('keep a path in parentheses as one step of the path around it', () => {
    expect(explicit('(a/b)/c')).toBe('(child::a/child::b)/child::c');
    expect(explicit('a/(/)')).toBe('child::a/(/)');
  });

  it('require a step after `/` and `//`', () => {
    expect(parseErrorOf('a/')?.message).toBe(
      'XPST0003: Expected an expression, but found the end of the expression at line 1, column 3'
    );
    expect(parseErrorOf('//')?.code).toBe('XPST0003');
  });

  it('give each step its span', () => {
    const path = parseXPath('a//b[1]');
    expect(path).toMatchObject({
      kind: 'path',
      start: 0,
      end: 7,
      steps: [
        { start: 0, end: 1 },
        { start: 1, end: 3, nodeTest: { start: 1, end: 3 } },
        { start: 3, end: 7 },
      ],
    });
    expect(parseXPath('..')).toMatchObject({ start: 0, end: 2, nodeTest: { kind: 'any-kind-test', start: 0, end: 2 } });
  });
});
