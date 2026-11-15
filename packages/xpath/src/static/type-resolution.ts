import {
  type AtomicType,
  atomicType,
  EMPTY_SEQUENCE,
  isArray,
  isAtomicValue,
  isFunction,
  isMap,
  isNode,
  isNumericType,
  NodeKind,
  type XdmArray,
  type XdmMap,
  type XdmNode,
  XS_NAMESPACE,
} from '@exemplarjs/xdm';
import { soleElement } from '@exemplarjs/xdm/internal';
import { XPathErrorCode, xpathError } from '@/api/xpath-exception';
import { parseSequenceType } from '@/syntax/parse-types';
import type {
  AttributeTest,
  DocumentTest,
  ElementTest,
  ItemTypeSyntax,
  SequenceTypeSyntax,
  TypedArrayTest,
  TypedFunctionTest,
  TypedMapTest,
  UnresolvedName,
} from '@/syntax/syntax-tree';
import { TokenStream } from '@/syntax/token-stream';
import {
  ANY_ITEM,
  atomicItemType,
  EMPTY_SEQUENCE_TYPE,
  ERROR_ITEM,
  type FunctionSignature,
  type ItemMatcher,
  type ItemShape,
  type ItemTest,
  NO_ITEM,
  ONE_ATOMIC,
  ONE_INTEGER,
  sequenceMatcher,
  type SequenceTypeMatcher,
  signatureOf,
} from './matchers.ts';
import { type ResolvedName, resolveElementName, resolvePlainName } from './name-resolution.ts';
import { expandedKey, type NamespaceContext } from './static-context.ts';
import { isSignatureSubtype, isSubtype } from './subtyping.ts';
import { printItemType, printSequenceType } from './type-text.ts';

/** The schema types an untyped element is an instance of. */
const ELEMENT_TYPES = new Set(['anyType', 'untyped']);
/** The schema types an untyped attribute is an instance of. */
const ATTRIBUTE_TYPES = new Set(['anyType', 'anySimpleType', 'anyAtomicType', 'untypedAtomic']);
/** The schema types that are not atomic: the complex and simple roots, unions and lists. */
const NON_ATOMIC_TYPES = new Set([
  'anyType',
  'anySimpleType',
  'untyped',
  'error',
  'numeric',
  'NMTOKENS',
  'IDREFS',
  'ENTITIES',
]);

/** Parses and compiles a sequence type given as text, such as `xs:integer*`; XPST0003 for text that is not one. */
export function sequenceTypeFromText(
  text: string,
  resolvePrefix: (prefix: string) => string | undefined,
  defaultElementNamespace = ''
): SequenceTypeMatcher {
  const tokens = new TokenStream(text);
  const syntax = parseSequenceType(tokens);
  if (!tokens.atEnd) xpathError(XPathErrorCode.SYNTAX_ERROR, `"${text}" is not a sequence type`, tokens.peek(), text);
  return compileSequenceType(syntax, { text, defaultElementNamespace, resolvePrefix });
}

/** Compiles a sequence type into a matcher. */
export function compileSequenceType(syntax: SequenceTypeSyntax, context: NamespaceContext): SequenceTypeMatcher {
  if (syntax.kind === 'empty-sequence-type') return EMPTY_SEQUENCE_TYPE;
  return sequenceMatcher(compileItemType(syntax.itemType, context), syntax.occurrence, printSequenceType(syntax));
}

/** What a node test asks beyond its kind, for subtyping: a name, a schema type, a target or a document's element. */
type NodeConstraints = Partial<Omit<Extract<ItemShape, { kind: 'node' }>, 'kind' | 'nodeKind'>>;

/** A node test of a kind, undefined for any, with what else it asks and the test of nodes of that kind that asks it. */
function nodeMatcher(
  nodeKind: NodeKind | undefined,
  constraints: NodeConstraints = {},
  matches: (node: XdmNode) => boolean = () => true
): ItemTest {
  const { name, typeName, nillable = false, target, element } = constraints;
  return {
    shape: { kind: 'node', nodeKind, name, typeName, nillable, target, element },
    matches: (item) => isNode(item) && (nodeKind === undefined || item.kind === nodeKind) && matches(item),
  };
}

/** Compiles an item type into a matcher, its text the type as written. */
export function compileItemType(syntax: ItemTypeSyntax, context: NamespaceContext): ItemMatcher {
  return { text: printItemType(syntax), ...itemTest(syntax, context) };
}

/** The test of an item type. */
function itemTest(syntax: ItemTypeSyntax, context: NamespaceContext): ItemTest {
  switch (syntax.kind) {
    case 'any-item-test': {
      return ANY_ITEM;
    }
    case 'atomic-or-union-type': {
      return atomicMatcher(syntax.name, context);
    }
    case 'any-kind-test': {
      return nodeMatcher(undefined);
    }
    case 'element-test': {
      return elementMatcher(syntax, context);
    }
    case 'attribute-test': {
      return attributeMatcher(syntax, context);
    }
    case 'document-test': {
      return documentMatcher(syntax, context);
    }
    case 'processing-instruction-test': {
      const target = syntax.target;
      return nodeMatcher(
        NodeKind.PROCESSING_INSTRUCTION,
        { target },
        (node) => target === undefined || node.localName === target
      );
    }
    case 'comment-test': {
      return nodeMatcher(NodeKind.COMMENT);
    }
    case 'text-test': {
      return nodeMatcher(NodeKind.TEXT);
    }
    case 'namespace-node-test': {
      return nodeMatcher(NodeKind.NAMESPACE);
    }
    case 'schema-element-test':
    case 'schema-attribute-test': {
      return noDeclaration(syntax.name, context);
    }
    case 'any-function-test': {
      return { shape: { kind: 'function', signature: undefined }, matches: isFunction };
    }
    case 'typed-function-test': {
      return typedFunctionMatcher(syntax, context);
    }
    case 'any-map-test': {
      return { shape: { kind: 'map', keyType: undefined, valueType: undefined }, matches: isMap };
    }
    case 'typed-map-test': {
      return typedMapMatcher(syntax, context);
    }
    case 'any-array-test': {
      return { shape: { kind: 'array', memberType: undefined }, matches: isArray };
    }
    default: {
      return typedArrayMatcher(syntax, context);
    }
  }
}

/** Raises XPST0008 for a schema element or attribute, which this processor has no declarations of, once its prefix resolves. */
function noDeclaration(name: UnresolvedName, context: NamespaceContext): never {
  resolveElementName(name, context);
  return xpathError(
    XPathErrorCode.UNDECLARED_NAME,
    `There is no schema declaration of ${name.localName}`,
    name,
    context.text
  );
}

/** The built-in union types XPath names: `xs:numeric`, of the numeric types, and `xs:error`, of none. */
export type UnionTypeName = 'xs:numeric' | 'xs:error';

/** The built-in union type a local name in the XML Schema namespace gives, if any. */
export function unionTypeNamed(localName: string): UnionTypeName | undefined {
  return localName === 'numeric' || localName === 'error' ? `xs:${localName}` : undefined;
}

/** The atomic or union type a name gives; raises XPST0051 for a name that is neither. */
export function resolveAtomicType(
  name: UnresolvedName,
  context: NamespaceContext
): { type: AtomicType | UnionTypeName; resolved: ResolvedName } {
  const resolved = resolveElementName(name, context);
  const isSchemaName = resolved.namespaceURI === XS_NAMESPACE;
  const union = isSchemaName ? unionTypeNamed(resolved.localName) : undefined;
  if (union !== undefined) return { type: union, resolved };
  const type = isSchemaName ? atomicType(resolved.localName) : undefined;
  if (type === undefined)
    xpathError(XPathErrorCode.UNKNOWN_TYPE, `${name.localName} is not a known atomic type`, name, context.text);
  return { type, resolved };
}

/** A matcher of an atomic type, or of `xs:numeric` or `xs:error`. */
function atomicMatcher(name: UnresolvedName, context: NamespaceContext): ItemTest {
  const { type } = resolveAtomicType(name, context);
  if (type === 'xs:numeric') {
    return { shape: { kind: 'numeric' }, matches: (item) => isAtomicValue(item) && isNumericType(item.type) };
  }
  return type === 'xs:error' ? ERROR_ITEM : atomicItemType(type);
}

/** Whether a node has a name, unless the name is undefined for any. */
function nameMatches(node: XdmNode, name: ResolvedName | undefined): boolean {
  return name === undefined || (node.localName === name.localName && node.namespaceURI === name.namespaceURI);
}

/**
 * The local name of the schema type an element or attribute test names, `fallback` when it names
 * none; raises XPST0008 for a type that is not known at all.
 */
function testedType(typeName: UnresolvedName | undefined, fallback: string, context: NamespaceContext): string {
  if (typeName === undefined) return fallback;
  const resolved = resolveElementName(typeName, context);
  const isSchemaName = resolved.namespaceURI === XS_NAMESPACE;
  const known =
    isSchemaName && (atomicType(resolved.localName) !== undefined || NON_ATOMIC_TYPES.has(resolved.localName));
  if (!known)
    xpathError(XPathErrorCode.UNDECLARED_NAME, `${typeName.localName} is not a known type`, typeName, context.text);
  return resolved.localName;
}

/** A resolved name as the expanded key a node shape keeps, or undefined for any name. */
function nameKey(name: ResolvedName | undefined): string | undefined {
  return name === undefined ? undefined : expandedKey(name);
}

/** A matcher of `element(name, type)`. */
function elementMatcher(syntax: ElementTest, context: NamespaceContext): ItemTest {
  const name = syntax.name === undefined ? undefined : resolveElementName(syntax.name, context);
  const type = testedType(syntax.typeName, 'anyType', context);
  if (!ELEMENT_TYPES.has(type)) return NO_ITEM;
  // `element(a)` is `element(a, xs:anyType?)`, which may be nilled.
  const nillable = syntax.typeName === undefined || syntax.nillable;
  const constraints = { name: nameKey(name), typeName: type, nillable };
  return nodeMatcher(NodeKind.ELEMENT, constraints, (node) => nameMatches(node, name));
}

/** A matcher of `attribute(name, type)`. */
function attributeMatcher(syntax: AttributeTest, context: NamespaceContext): ItemTest {
  const name = syntax.name === undefined ? undefined : resolvePlainName(syntax.name, context);
  const typeName = testedType(syntax.typeName, 'anyAtomicType', context);
  if (!ATTRIBUTE_TYPES.has(typeName)) return NO_ITEM;
  return nodeMatcher(NodeKind.ATTRIBUTE, { name: nameKey(name), typeName }, (node) => nameMatches(node, name));
}

/** A matcher of `document-node()`, or of a document whose one element, with no text beside it, matches an element test. */
function documentMatcher(syntax: DocumentTest, context: NamespaceContext): ItemTest {
  if (syntax.elementTest === undefined) return nodeMatcher(NodeKind.DOCUMENT);
  const element = compileItemType(syntax.elementTest, context);
  return nodeMatcher(NodeKind.DOCUMENT, { element }, (node) => {
    const sole = soleElement(node);
    return sole !== undefined && element.matches(sole);
  });
}

/**
 * Whether a map or array fits a function type of one parameter (XPath §2.5.5.7): a map when the
 * parameter is atomic and every value, as well as the empty sequence of a missing key, is of the
 * result type; an array when the parameter is an integer and every member is of the result type.
 */
function structureFits(item: XdmMap | XdmArray, signature: FunctionSignature): boolean {
  const parameter = signature.parameterTypes[0] as SequenceTypeMatcher;
  const result = signature.returnType;
  if (isArray(item)) return isSubtype(parameter, ONE_INTEGER) && item.members.every((member) => result.matches(member));
  if (!isSubtype(parameter, ONE_ATOMIC) || !result.matches(EMPTY_SEQUENCE)) return false;
  for (const [, value] of item.entries()) if (!result.matches(value)) return false;
  return true;
}

/** A matcher of `function(types) as type`: a function item of that arity whose signature is a subtype of it, or a map or array that fits it. */
function typedFunctionMatcher(syntax: TypedFunctionTest, context: NamespaceContext): ItemTest {
  const signature = {
    parameterTypes: syntax.parameterTypes.map((type) => compileSequenceType(type, context)),
    returnType: compileSequenceType(syntax.returnType, context),
  };
  const arity = signature.parameterTypes.length;
  return {
    shape: { kind: 'function', signature },
    matches: (item) => {
      if (!isFunction(item) || item.arity !== arity) return false;
      if (isMap(item) || isArray(item)) return structureFits(item, signature);
      return isSignatureSubtype(signatureOf(item), signature);
    },
  };
}

/** A matcher of `map(key, value)`: a map whose every key and value are of those types. */
function typedMapMatcher(syntax: TypedMapTest, context: NamespaceContext): ItemTest {
  const keyType = compileItemType(syntax.keyType, context);
  const valueType = compileSequenceType(syntax.valueType, context);
  return {
    shape: { kind: 'map', keyType, valueType },
    matches: (item) => {
      if (!isMap(item)) return false;
      for (const [key, value] of item.entries()) if (!keyType.matches(key) || !valueType.matches(value)) return false;
      return true;
    },
  };
}

/** A matcher of `array(member)`: an array whose every member is of that type. */
function typedArrayMatcher(syntax: TypedArrayTest, context: NamespaceContext): ItemTest {
  const memberType = compileSequenceType(syntax.memberType, context);
  return {
    shape: { kind: 'array', memberType },
    matches: (item) => isArray(item) && item.members.every((member) => memberType.matches(member)),
  };
}
