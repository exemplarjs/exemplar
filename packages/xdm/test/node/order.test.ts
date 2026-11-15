import { at, parse } from '@test/helpers/trees';
import { describe, expect, it } from 'vitest';
import { compareOrder, type XdmNode } from '@/index';

describe('compareOrder', () => {
  const document = parse('<a xmlns:p="urn:p" x="1" y="2"><b/></a>');
  const a = at(document, 0);
  const [x, y] = a.attributes() as [XdmNode, XdmNode];
  const [xml, p] = a.namespaceNodes() as [XdmNode, XdmNode];
  const b = at(a, 0);

  it('puts an element before its namespace nodes, then its attributes, then its children', () => {
    const order = [document, a, xml, p, x, y, b];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        expect(Math.sign(compareOrder(order[i] as XdmNode, order[j] as XdmNode))).toBe(Math.sign(i - j));
      }
    }
  });

  it('orders the nodes of different trees by when the trees were made', () => {
    const later = parse('<z/>');
    expect(compareOrder(b, later)).toBeLessThan(0);
    expect(compareOrder(later, document)).toBeGreaterThan(0);
  });

  it('tells namespace nodes of different elements apart', () => {
    expect(compareOrder(at(a, 0).namespaceNodes()[1] as XdmNode, p)).toBeGreaterThan(0);
    expect((at(a, 0).namespaceNodes()[1] as XdmNode).isSameNode(p)).toBe(false);
  });
});
