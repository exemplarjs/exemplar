import { describe, expect, it } from 'vitest';
import { ElementStack } from '@/cursor/element-stack';
import { XmlAttributeScopes } from '@/cursor/xml-attribute-scopes';

/** An element stack whose open elements have the serial numbers given, outermost first. */
function open(...serials: number[]): ElementStack {
  const elements = new ElementStack();
  elements.serials.push(...serials);
  return elements;
}

describe('XmlAttributeScopes', () => {
  it('gives the attributes of the open elements above a depth, outermost first', () => {
    const elements = open(1, 2, 3);
    const scopes = new XmlAttributeScopes(elements);
    scopes.note(0, 'xml:lang', 'en');
    scopes.note(2, 'xml:space', 'preserve');
    scopes.note(2, 'xml:base', 'b/');
    expect([scopes.above(0), scopes.above(1), scopes.above(3)]).toEqual([
      [],
      [['xml:lang', 'en']],
      [
        ['xml:lang', 'en'],
        ['xml:space', 'preserve'],
        ['xml:base', 'b/'],
      ],
    ]);
  });

  it('leaves out the attributes of elements that have ended, and forgets them once another element notes some', () => {
    const elements = open(1, 2);
    const scopes = new XmlAttributeScopes(elements);
    scopes.note(0, 'xml:lang', 'en');
    scopes.note(1, 'xml:base', 'a/');
    // The element at depth 1 ends, and another starts there.
    elements.serials[1] = 3;
    expect(scopes.above(2)).toEqual([['xml:lang', 'en']]);
    scopes.note(1, 'xml:base', 'c/');
    expect(scopes.above(2)).toEqual([
      ['xml:lang', 'en'],
      ['xml:base', 'c/'],
    ]);
  });
});
