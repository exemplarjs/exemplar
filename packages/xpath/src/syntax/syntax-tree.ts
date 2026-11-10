import type { Axis, Occurrence, XdmAtomicValue } from '@exemplarjs/xdm';
import type { TextSpan } from '@/api/xpath-exception';

/** Where a part of an expression sits in its text: the offset of its first character and the offset just past its last. */
export type Span = TextSpan;

/** A node of the syntax tree, of one kind, with its span. */
interface SyntaxNode<Kind extends string> extends Span {
  readonly kind: Kind;
}

/**
 * A name as written, before its prefix is resolved: `title` has prefix `''`, `dc:title` prefix
 * `dc`, and `Q{http://example.com}title` its namespace URI and no prefix.
 */
export interface UnresolvedName extends Span {
  readonly prefix: string;
  /** The namespace URI written in braces, or undefined when the name has none. */
  readonly namespaceURI: string | undefined;
  readonly localName: string;
}

// Types.

/** `item()`. */
export type AnyItemTest = SyntaxNode<'any-item-test'>;

/** An atomic or union type named in a sequence type, such as `xs:integer`. */
export interface AtomicOrUnionType extends SyntaxNode<'atomic-or-union-type'> {
  readonly name: UnresolvedName;
}

/** `node()`. */
export type AnyKindTest = SyntaxNode<'any-kind-test'>;

/** `document-node()`, or `document-node(element(...))` for documents with one such element. */
export interface DocumentTest extends SyntaxNode<'document-test'> {
  readonly elementTest: ElementTest | SchemaElementTest | undefined;
}

/** `element()`, `element(name)` or `element(name, type)`; `element(*)` is written as `element()`. */
export interface ElementTest extends SyntaxNode<'element-test'> {
  /** The element's name, or undefined for any. */
  readonly name: UnresolvedName | undefined;
  readonly typeName: UnresolvedName | undefined;
  /** Whether the type is followed by `?`, which lets the element be nilled. */
  readonly nillable: boolean;
}

/** `attribute()`, `attribute(name)` or `attribute(name, type)`. */
export interface AttributeTest extends SyntaxNode<'attribute-test'> {
  /** The attribute's name, or undefined for any. */
  readonly name: UnresolvedName | undefined;
  readonly typeName: UnresolvedName | undefined;
}

/** `schema-element(name)`. */
export interface SchemaElementTest extends SyntaxNode<'schema-element-test'> {
  readonly name: UnresolvedName;
}

/** `schema-attribute(name)`. */
export interface SchemaAttributeTest extends SyntaxNode<'schema-attribute-test'> {
  readonly name: UnresolvedName;
}

/** `processing-instruction()` or `processing-instruction(target)`, the target given as a name or a string. */
export interface ProcessingInstructionTest extends SyntaxNode<'processing-instruction-test'> {
  /** The target, or undefined for any. */
  readonly target: string | undefined;
}

/** `comment()`. */
export type CommentTest = SyntaxNode<'comment-test'>;

/** `text()`. */
export type TextTest = SyntaxNode<'text-test'>;

/** `namespace-node()`. */
export type NamespaceNodeTest = SyntaxNode<'namespace-node-test'>;

/** A test of a node's kind, and of its name where the kind has one. */
export type KindTest =
  | AnyKindTest
  | DocumentTest
  | ElementTest
  | AttributeTest
  | SchemaElementTest
  | SchemaAttributeTest
  | ProcessingInstructionTest
  | CommentTest
  | TextTest
  | NamespaceNodeTest;

/** `function(*)`. */
export type AnyFunctionTest = SyntaxNode<'any-function-test'>;

/** `function(xs:string, item()*) as xs:boolean`. */
export interface TypedFunctionTest extends SyntaxNode<'typed-function-test'> {
  readonly parameterTypes: readonly SequenceTypeSyntax[];
  readonly returnType: SequenceTypeSyntax;
}

/** `map(*)`. */
export type AnyMapTest = SyntaxNode<'any-map-test'>;

/** `map(xs:string, item()*)`. */
export interface TypedMapTest extends SyntaxNode<'typed-map-test'> {
  readonly keyType: AtomicOrUnionType;
  readonly valueType: SequenceTypeSyntax;
}

/** `array(*)`. */
export type AnyArrayTest = SyntaxNode<'any-array-test'>;

/** `array(xs:integer)`. */
export interface TypedArrayTest extends SyntaxNode<'typed-array-test'> {
  readonly memberType: SequenceTypeSyntax;
}

/** What each item of a sequence type must be; parentheses around one are dropped. */
export type ItemTypeSyntax =
  | AnyItemTest
  | AtomicOrUnionType
  | KindTest
  | AnyFunctionTest
  | TypedFunctionTest
  | AnyMapTest
  | TypedMapTest
  | AnyArrayTest
  | TypedArrayTest;

/** `empty-sequence()`. */
export type EmptySequenceType = SyntaxNode<'empty-sequence-type'>;

/** An item type with an occurrence indicator, such as `xs:integer*`. */
export interface ItemSequenceType extends SyntaxNode<'item-sequence-type'> {
  readonly itemType: ItemTypeSyntax;
  readonly occurrence: Occurrence;
}

/** A sequence type as written: `empty-sequence()`, or an item type with an occurrence indicator. */
export type SequenceTypeSyntax = EmptySequenceType | ItemSequenceType;

/** The type of a cast: an atomic type's name, and whether `?` allows the empty sequence. */
export interface SingleType extends SyntaxNode<'single-type'> {
  readonly name: UnresolvedName;
  readonly allowsEmpty: boolean;
}

// Steps.

/** The axes a step can take. */
export type AxisName = Axis;

/** A test of one name, such as `title` or `dc:title`. */
export interface NameTest extends SyntaxNode<'name-test'> {
  readonly name: UnresolvedName;
}

/** `*`: any name. */
export type AnyNameTest = SyntaxNode<'any-name-test'>;

/** `dc:*` or `Q{uri}*`: any local name in one namespace. */
export interface NamespaceTest extends SyntaxNode<'namespace-test'> {
  readonly prefix: string;
  readonly namespaceURI: string | undefined;
}

/** `*:title`: one local name in any namespace. */
export interface LocalNameTest extends SyntaxNode<'local-name-test'> {
  readonly localName: string;
}

/** What a step's nodes must be: a kind test or a name test. */
export type NodeTestSyntax = KindTest | NameTest | AnyNameTest | NamespaceTest | LocalNameTest;

/**
 * A step along an axis, with its predicates. Abbreviations are expanded: `@id` is
 * `attribute::id`, `..` is `parent::node()`, and `//` in a path is `descendant-or-self::node()`.
 */
export interface AxisStep extends SyntaxNode<'axis-step'> {
  readonly axis: AxisName;
  readonly nodeTest: NodeTestSyntax;
  readonly predicates: readonly Expression[];
}

// Expressions.

/** An integer, decimal, double or string literal, as the value it stands for. */
export interface Literal extends SyntaxNode<'literal'> {
  readonly value: XdmAtomicValue;
}

/** `$name`. */
export interface VariableReference extends SyntaxNode<'variable-reference'> {
  readonly name: UnresolvedName;
}

/** `.`. */
export type ContextItem = SyntaxNode<'context-item'>;

/** `/`: the root of the tree holding the context node. */
export type RootExpression = SyntaxNode<'root'>;

/** `(a, b)` or `()`; one expression in parentheses is that expression. */
export interface SequenceExpression extends SyntaxNode<'sequence'> {
  readonly items: readonly Expression[];
}

/** A `?` in an argument list, which makes a call a partial application. */
export type ArgumentPlaceholder = SyntaxNode<'argument-placeholder'>;

/** An argument of a call: an expression or a placeholder. */
export type Argument = Expression | ArgumentPlaceholder;

/** `name(arguments)`. */
export interface FunctionCall extends SyntaxNode<'function-call'> {
  readonly name: UnresolvedName;
  readonly arguments: readonly Argument[];
}

/** `name#arity`. */
export interface NamedFunctionReference extends SyntaxNode<'named-function-reference'> {
  readonly name: UnresolvedName;
  readonly arity: number;
}

/** A parameter of an inline function, with its declared type when it has one. */
export interface Parameter extends Span {
  readonly name: UnresolvedName;
  readonly type: SequenceTypeSyntax | undefined;
}

/** `function($a as xs:integer) as xs:integer { $a + 1 }`; an empty body is the empty sequence. */
export interface InlineFunction extends SyntaxNode<'inline-function'> {
  readonly parameters: readonly Parameter[];
  readonly returnType: SequenceTypeSyntax | undefined;
  readonly body: Expression;
}

/** One `key : value` entry of a map constructor. */
export interface MapEntry {
  readonly key: Expression;
  readonly value: Expression;
}

/** `map { key : value, ... }`. */
export interface MapConstructor extends SyntaxNode<'map-constructor'> {
  readonly entries: readonly MapEntry[];
}

/** `[a, b]`: an array with one member for each expression. */
export interface SquareArrayConstructor extends SyntaxNode<'square-array-constructor'> {
  readonly members: readonly Expression[];
}

/** `array { a, b }`: an array with one member for each item of the expression. */
export interface CurlyArrayConstructor extends SyntaxNode<'curly-array-constructor'> {
  readonly content: Expression;
}

/** A lookup's key: an expression, with `?name` and `?1` written as the literals they stand for, or `*` for every key. */
export type LookupKey = Expression | '*';

/** `base?key`. */
export interface Lookup extends SyntaxNode<'lookup'> {
  readonly base: Expression;
  readonly key: LookupKey;
}

/** `?key`, looking up in the context item. */
export interface UnaryLookup extends SyntaxNode<'unary-lookup'> {
  readonly key: LookupKey;
}

/** `base[predicate]`, filtering a primary expression; a predicate on a step belongs to the step. */
export interface Filter extends SyntaxNode<'filter'> {
  readonly base: Expression;
  readonly predicate: Expression;
}

/** `function-expression(arguments)`, calling a function item. */
export interface DynamicCall extends SyntaxNode<'dynamic-call'> {
  readonly function: Expression;
  readonly arguments: readonly Argument[];
}

/** Two or more steps joined by `/`, such as `a/b`, or `/a`, whose first step is the root. */
export interface PathExpression extends SyntaxNode<'path'> {
  readonly steps: readonly Expression[];
}

/** `a or b`, `a and b`. */
export interface LogicalExpression extends SyntaxNode<'logical'> {
  readonly operator: 'or' | 'and';
  readonly left: Expression;
  readonly right: Expression;
}

/** The comparison operators: value, general and node comparisons. */
export type ComparisonOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'is'
  | '<<'
  | '>>';

/** `a eq b`, `a = b`, `a is b` and the other comparisons. */
export interface Comparison extends SyntaxNode<'comparison'> {
  readonly operator: ComparisonOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/** `a || b`. */
export interface StringConcatenation extends SyntaxNode<'string-concatenation'> {
  readonly left: Expression;
  readonly right: Expression;
}

/** `a to b`. */
export interface RangeExpression extends SyntaxNode<'range'> {
  readonly left: Expression;
  readonly right: Expression;
}

/** The arithmetic operators. */
export type ArithmeticOperator = '+' | '-' | '*' | 'div' | 'idiv' | 'mod';

/** `a + b`, `a div b` and the other arithmetic. */
export interface Arithmetic extends SyntaxNode<'arithmetic'> {
  readonly operator: ArithmeticOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/** `a union b` (or `a | b`), `a intersect b`, `a except b`. */
export interface SetOperation extends SyntaxNode<'set-operation'> {
  readonly operator: 'union' | 'intersect' | 'except';
  readonly left: Expression;
  readonly right: Expression;
}

/** `a ! b`: `b` evaluated for each item of `a`. */
export interface SimpleMap extends SyntaxNode<'simple-map'> {
  readonly left: Expression;
  readonly right: Expression;
}

/** `-a` or `+a`. */
export interface UnaryExpression extends SyntaxNode<'unary'> {
  readonly operator: '+' | '-';
  readonly operand: Expression;
}

/** `a instance of type`. */
export interface InstanceOf extends SyntaxNode<'instance-of'> {
  readonly operand: Expression;
  readonly type: SequenceTypeSyntax;
}

/** `a treat as type`. */
export interface TreatAs extends SyntaxNode<'treat-as'> {
  readonly operand: Expression;
  readonly type: SequenceTypeSyntax;
}

/** `a castable as type`. */
export interface CastableAs extends SyntaxNode<'castable-as'> {
  readonly operand: Expression;
  readonly type: SingleType;
}

/** `a cast as type`. */
export interface CastAs extends SyntaxNode<'cast-as'> {
  readonly operand: Expression;
  readonly type: SingleType;
}

/** `a => f(b)`: the function named `f` called with `a` and then `b`. */
export interface StaticArrow extends SyntaxNode<'static-arrow'> {
  readonly operand: Expression;
  readonly name: UnresolvedName;
  readonly arguments: readonly Argument[];
}

/** `a => $f(b)` or `a => (expression)(b)`: a function item called with `a` and then `b`. */
export interface DynamicArrow extends SyntaxNode<'dynamic-arrow'> {
  readonly operand: Expression;
  readonly function: Expression;
  readonly arguments: readonly Argument[];
}

/** One `$name in expression` or `$name := expression` of a `for`, `let`, `some` or `every`. */
export interface VariableBinding extends Span {
  readonly name: UnresolvedName;
  readonly expression: Expression;
}

/** `for $a in x, $b in y return body`. */
export interface ForExpression extends SyntaxNode<'for'> {
  readonly bindings: readonly VariableBinding[];
  readonly body: Expression;
}

/** `let $a := x, $b := y return body`. */
export interface LetExpression extends SyntaxNode<'let'> {
  readonly bindings: readonly VariableBinding[];
  readonly body: Expression;
}

/** `some $a in x satisfies condition`, or `every`. */
export interface QuantifiedExpression extends SyntaxNode<'quantified'> {
  readonly quantifier: 'some' | 'every';
  readonly bindings: readonly VariableBinding[];
  readonly condition: Expression;
}

/** `if (condition) then a else b`. */
export interface IfExpression extends SyntaxNode<'if'> {
  readonly condition: Expression;
  readonly thenExpression: Expression;
  readonly elseExpression: Expression;
}

/** Any XPath expression. */
export type Expression =
  | Literal
  | VariableReference
  | ContextItem
  | RootExpression
  | SequenceExpression
  | FunctionCall
  | NamedFunctionReference
  | InlineFunction
  | MapConstructor
  | SquareArrayConstructor
  | CurlyArrayConstructor
  | Lookup
  | UnaryLookup
  | Filter
  | DynamicCall
  | PathExpression
  | AxisStep
  | LogicalExpression
  | Comparison
  | StringConcatenation
  | RangeExpression
  | Arithmetic
  | SetOperation
  | SimpleMap
  | UnaryExpression
  | InstanceOf
  | TreatAs
  | CastableAs
  | CastAs
  | StaticArrow
  | DynamicArrow
  | ForExpression
  | LetExpression
  | QuantifiedExpression
  | IfExpression;
