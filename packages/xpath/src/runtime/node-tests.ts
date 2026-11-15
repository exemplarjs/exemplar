import { ANY_KIND, ANY_NAME, NodeKind, type NodeTest, type Tree, type XdmNode } from '@exemplarjs/xdm';
import { namespaceOf, type ResolvedName, resolveElementName, resolvePlainName } from '@/static/name-resolution';
import type { NamespaceContext } from '@/static/static-context';
import { compileItemType } from '@/static/type-resolution';
import type { AxisName, NodeTestSyntax, UnresolvedName } from '@/syntax/syntax-tree';

/**
 * A step's node test, compiled: the axis-level test of a kind and name, made for each tree, since
 * names are numbered per tree, and a refinement for what that test cannot say, such as `p:*`.
 */
export interface StepTest {
  forTree(tree: Tree): NodeTest;

  readonly refine: ((node: XdmNode) => boolean) | undefined;
}

/** The kind of node an axis's name tests select: attributes on the attribute axis, namespaces on the namespace axis, else elements. */
function principalKind(axis: AxisName): number {
  if (axis === 'attribute') return NodeKind.ATTRIBUTE;
  return axis === 'namespace' ? NodeKind.NAMESPACE : NodeKind.ELEMENT;
}

/** A step test of a kind and, when given, a name, with an optional refinement. */
function stepTest(kind: number, name: ResolvedName | undefined, refine?: (node: XdmNode) => boolean): StepTest {
  if (name === undefined) {
    const test: NodeTest = { kind, name: ANY_NAME };
    return { forTree: () => test, refine };
  }
  let lastTree: Tree | undefined;
  let lastTest: NodeTest = { kind, name: ANY_NAME };
  return {
    forTree(tree) {
      if (tree !== lastTree) {
        lastTree = tree;
        lastTest = { kind, name: tree.names.lookup(name.namespaceURI, name.localName) };
      }
      return lastTest;
    },
    refine,
  };
}

/** Resolves a name test's name by the principal kind: elements take the default element namespace. */
function resolveTestName(name: UnresolvedName, kind: number, context: NamespaceContext): ResolvedName {
  return kind === NodeKind.ELEMENT ? resolveElementName(name, context) : resolvePlainName(name, context);
}

/** Compiles a step's node test for its axis. */
export function compileNodeTest(syntax: NodeTestSyntax, axis: AxisName, context: NamespaceContext): StepTest {
  const principal = principalKind(axis);
  switch (syntax.kind) {
    case 'name-test': {
      return stepTest(principal, resolveTestName(syntax.name, principal, context));
    }
    case 'any-name-test': {
      return stepTest(principal, undefined);
    }
    case 'namespace-test': {
      const namespaceURI = syntax.namespaceURI ?? namespaceOf(syntax.prefix, syntax, context);
      return stepTest(principal, undefined, (node) => node.namespaceURI === namespaceURI);
    }
    case 'local-name-test': {
      const localName = syntax.localName;
      return stepTest(principal, undefined, (node) => node.localName === localName);
    }
    case 'any-kind-test': {
      return stepTest(ANY_KIND, undefined);
    }
    default: {
      return kindTest(syntax, context);
    }
  }
}

/** The node kind each kind test selects. */
const KIND_OF_TEST: Readonly<Record<string, number>> = {
  'element-test': NodeKind.ELEMENT,
  'attribute-test': NodeKind.ATTRIBUTE,
  'schema-element-test': NodeKind.ELEMENT,
  'schema-attribute-test': NodeKind.ATTRIBUTE,
  'document-test': NodeKind.DOCUMENT,
  'processing-instruction-test': NodeKind.PROCESSING_INSTRUCTION,
  'comment-test': NodeKind.COMMENT,
  'text-test': NodeKind.TEXT,
  'namespace-node-test': NodeKind.NAMESPACE,
};

/** A kind test as a step test: by kind at the axis, refined by the item type's own test where it says more. */
function kindTest(
  syntax: Exclude<
    NodeTestSyntax,
    { kind: 'name-test' | 'any-name-test' | 'namespace-test' | 'local-name-test' | 'any-kind-test' }
  >,
  context: NamespaceContext
): StepTest {
  const matcher = compileItemType(syntax, context);
  const kind = KIND_OF_TEST[syntax.kind] as number;
  const simple = syntax.kind === 'comment-test' || syntax.kind === 'text-test' || syntax.kind === 'namespace-node-test';
  return stepTest(kind, undefined, simple ? undefined : (node) => matcher.matches(node));
}
