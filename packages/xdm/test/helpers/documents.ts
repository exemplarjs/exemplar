import { fc } from '@fast-check/vitest';

/** An element as the generator models it; prefixes it uses but no ancestor declares are declared when it is written. */
interface ElementModel {
  readonly kind: 'element';
  readonly prefix: string;
  readonly local: string;
  /** Namespace declarations, prefix to URI; `''` as the URI undeclares the default namespace. */
  readonly declarations: readonly [string, string][];
  /** Attributes: prefix, local name, value. */
  readonly attributes: readonly [string, string, string][];
  readonly children: readonly Model[];
}

/** A document's nodes as the generator models them. */
type Model =
  | ElementModel
  | { readonly kind: 'text'; readonly text: string; readonly cdata: boolean }
  | { readonly kind: 'comment'; readonly text: string }
  | { readonly kind: 'pi'; readonly target: string; readonly data: string };

const local = fc.constantFrom('a', 'b', 'item', 'é', 'x1');
const prefix = fc.constantFrom('', '', 'p', 'q');
const uri = fc.constantFrom('urn:a', 'urn:b', '');
const text = fc.string({ unit: fc.constantFrom(...Array.from('ab z\t\n<>&]é𝄞')), minLength: 1, maxLength: 8 });
const attribute = fc.tuple(fc.constantFrom('', 'p', 'xml'), fc.constantFrom('k', 'lang', 'n'), text);
// No `-`, which comments may not end with or double.
const plain = fc.string({ unit: fc.constantFrom(...Array.from('ab z.é')), maxLength: 6 });

const elementModel: fc.Arbitrary<ElementModel> = fc.letrec<{ node: Model; element: ElementModel }>((tie) => ({
  element: fc.record({
    kind: fc.constant('element' as const),
    prefix,
    local,
    declarations: fc.uniqueArray(fc.tuple(prefix, uri), { selector: ([declared]) => declared, maxLength: 2 }),
    attributes: fc.uniqueArray(attribute, { selector: ([, name]) => name, maxLength: 3 }),
    children: fc.array(tie('node'), { maxLength: 4 }),
  }),
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.record({ kind: fc.constant('text' as const), text, cdata: fc.boolean() }),
    fc.record({ kind: fc.constant('comment' as const), text: plain }),
    fc.record({ kind: fc.constant('pi' as const), target: fc.constantFrom('pi', 'go'), data: plain }),
    tie('element')
  ),
})).element;

/** Random documents with namespaces, `xml:` attributes, text, CDATA, comments and processing instructions. */
export const documents: fc.Arbitrary<string> = elementModel.map(
  (root) => `<?xml version="1.0"?>${write(root, new Map())}`
);

/** Escapes text for content, or for a double-quoted attribute value, where whitespace must survive normalization. */
function escape(value: string, attribute: boolean): string {
  return value.replaceAll(/[<>&"\t\n]/g, (c) => (attribute || '<>&'.includes(c) ? `&#${c.codePointAt(0)};` : c));
}

/** Writes a node within the namespaces in scope, declaring any prefix it uses that is not bound. */
function write(node: Model, scope: ReadonlyMap<string, string>): string {
  switch (node.kind) {
    case 'element': {
      return writeElement(node, scope);
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

/** Writes an element, its declarations, attributes and content. */
function writeElement(node: ElementModel, parentScope: ReadonlyMap<string, string>): string {
  const scope = new Map(parentScope);
  const declarations = new Map<string, string>();
  const declare = (declared: string, namespace: string): void => {
    declarations.set(declared, namespace);
    scope.set(declared, namespace);
  };
  // A prefixed undeclaration is XML 1.1 only, so a prefix is bound to a namespace or left alone.
  for (const [declared, namespace] of node.declarations)
    if (declared === '' || namespace !== '') declare(declared, namespace);
  if (node.prefix !== '' && (scope.get(node.prefix) ?? '') === '') declare(node.prefix, 'urn:a');
  let markup = `<${qualified(node.prefix, node.local)}`;
  for (const [declared, namespace] of declarations) {
    markup += declared === '' ? ` xmlns="${namespace}"` : ` xmlns:${declared}="${namespace}"`;
  }
  for (const [attributePrefix, name, value] of node.attributes) {
    // `p:` only where p is bound; `xml:` only for xml:lang.
    const unbound = attributePrefix === 'p' && (scope.get('p') ?? '') === '';
    const usable = !unbound && (attributePrefix !== 'xml' || name === 'lang');
    markup += ` ${usable ? qualified(attributePrefix, name) : name}="${escape(value, true)}"`;
  }
  const content = node.children.map((child) => write(child, scope)).join('');
  return `${markup}>${content}</${qualified(node.prefix, node.local)}>`;
}

/** A qualified name. */
function qualified(namePrefix: string, name: string): string {
  return namePrefix === '' ? name : `${namePrefix}:${name}`;
}
