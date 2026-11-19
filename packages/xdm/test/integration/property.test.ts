import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { ANY_NODE, Axis, axisIterator, NO_NODE, NodeKind, type Tree, XdmDocumentBuilder, type XdmNode } from '@/index';

// The release run scales the number of runs up.
const SCALE = Number(globalThis.process?.env['EXEMPLAR_FUZZ_SCALE'] ?? 1);

/** A document as the generator models it. */
type Model =
  | {
      readonly kind: 'element';
      readonly name: string;
      readonly attributes: readonly [string, string][];
      readonly children: readonly Model[];
    }
  | { readonly kind: 'text'; readonly text: string; readonly cdata: boolean }
  | { readonly kind: 'comment'; readonly text: string }
  | { readonly kind: 'pi'; readonly target: string; readonly data: string };

const nameStart = fc.constantFrom(...Array.from('abxyé中'));
const nameChar = fc.constantFrom(...Array.from('ab1-.é'));
const name = fc.tuple(nameStart, fc.string({ unit: nameChar, maxLength: 4 })).map(([first, rest]) => first + rest);
const text = fc.string({ unit: fc.constantFrom(...Array.from('ab z\t\n<>&"]é中𝄞')), minLength: 1, maxLength: 10 });
// No `-`, which comments may not end with or double.
const plain = fc.string({ unit: fc.constantFrom(...Array.from('ab z.é')), maxLength: 8 });

const model: fc.Arbitrary<Model> = fc.letrec<{ node: Model; element: Model }>((tie) => ({
  element: fc.record({
    kind: fc.constant('element' as const),
    name,
    attributes: fc.uniqueArray(fc.tuple(name, text), { selector: ([attribute]) => attribute, maxLength: 3 }),
    children: fc.array(tie('node'), { maxLength: 4 }),
  }),
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.record({ kind: fc.constant('text' as const), text, cdata: fc.boolean() }),
    fc.record({ kind: fc.constant('comment' as const), text: plain }),
    fc.record({
      kind: fc.constant('pi' as const),
      target: name.filter((target) => !/^xml/i.test(target)),
      data: plain,
    }),
    tie('element')
  ),
})).element;

/** Escapes text for content, or for a double-quoted attribute value, where whitespace must survive normalization. */
function escape(value: string, attribute: boolean): string {
  return value.replaceAll(/[<>&"\t\n]/g, (c) => (attribute || '<>&'.includes(c) ? `&#${c.codePointAt(0)};` : c));
}

/** Writes a model as XML. */
function serialize(node: Model): string {
  switch (node.kind) {
    case 'element': {
      const attributes = node.attributes.map(([key, value]) => ` ${key}="${escape(value, true)}"`).join('');
      return `<${node.name}${attributes}>${node.children.map(serialize).join('')}</${node.name}>`;
    }
    case 'text': {
      return node.cdata && !node.text.includes(']]>') ? `<![CDATA[${node.text}]]>` : escape(node.text, false);
    }
    case 'comment': {
      return `<!--${node.text}-->`;
    }
    default: {
      return `<?${node.target} ${node.data}?>`;
    }
  }
}

/** The XDM children a model's children make: adjacent text joined, comments' and instructions' content kept. */
function expectedChildren(children: readonly Model[]): string[] {
  const expected: string[] = [];
  let pending: string | undefined;
  for (const child of children) {
    if (child.kind === 'text') {
      pending = (pending ?? '') + child.text;
      continue;
    }
    if (pending !== undefined) expected.push(`text ${pending}`);
    pending = undefined;
    if (child.kind === 'element') expected.push(`element ${child.name}`);
    else if (child.kind === 'comment') expected.push(`comment ${child.text}`);
    // The whitespace after the target is not part of the data (XML 1.0 §2.6).
    else expected.push(`processing-instruction ${child.target} ${child.data.trimStart()}`);
  }
  if (pending !== undefined) expected.push(`text ${pending}`);
  return expected;
}

/** What a node shows the comparison: its kind, then its name and value as the model has them. */
function shown(node: XdmNode): string {
  if (node.kind === NodeKind.ELEMENT) return `element ${node.nodeName?.toString()}`;
  if (node.kind === NodeKind.PROCESSING_INSTRUCTION)
    return `processing-instruction ${node.localName} ${node.stringValue}`;
  return `${node.kindName} ${node.stringValue}`;
}

/** The text a model holds, as its string value. */
function stringValue(node: Model): string {
  if (node.kind === 'text') return node.text;
  return node.kind === 'element' ? node.children.map(stringValue).join('') : '';
}

/** Checks a tree element against its model, and its children likewise. */
function compare(node: XdmNode, expected: Model): void {
  if (expected.kind !== 'element') return;
  expect(node.stringValue).toBe(stringValue(expected));
  expect(node.attributes().map((attribute) => [attribute.nodeName?.toString(), attribute.stringValue])).toEqual(
    expected.attributes
  );
  const children = node.children();
  expect(children.map((child) => shown(child))).toEqual(expectedChildren(expected.children));
  const elements = children.filter((child) => child.kind === NodeKind.ELEMENT);
  const models = expected.children.filter((child) => child.kind === 'element');
  for (const [i, child] of elements.entries()) compare(child, models[i] as Model);
}

/** Checks that parents, ends and siblings agree with one another across the whole tree. */
function checkStructure(tree: Tree): void {
  for (let node = 1; node < tree.size; node++) {
    const parent = tree.parent(node);
    expect(tree.isDescendant(node, parent)).toBe(true);
    expect(tree.end(node)).toBeLessThanOrEqual(tree.end(parent));
    const children: number[] = [];
    const iterator = axisIterator(tree, parent, Axis.CHILD, ANY_NODE);
    for (let child = iterator.next(); child !== NO_NODE; child = iterator.next()) children.push(child);
    expect(children).toContain(node);
    const previous = tree.previousSibling(node);
    expect(previous === NO_NODE ? parent + 1 : tree.nextSibling(previous)).toBe(node);
  }
}

test.prop([model], { numRuns: 200 * SCALE })('builds the tree a random document describes', (root) => {
  const document = new XdmDocumentBuilder().parse(serialize(root));
  checkStructure(document.tree);
  compare(document.children()[0] as XdmNode, root);
});
