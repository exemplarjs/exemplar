import { Occurrence } from '@exemplarjs/xdm';
import { collapseWhitespace, isNcName } from '@exemplarjs/xml/internal';
import { XPathErrorCode, xpathError } from '@/api/xpath-exception';
import type {
  AtomicOrUnionType,
  ElementTest,
  ItemTypeSyntax,
  KindTest,
  SchemaElementTest,
  SequenceTypeSyntax,
  SingleType,
  UnresolvedName,
} from './syntax-tree.ts';
import type { TokenStream } from './token-stream.ts';
import { TokenKind } from './tokens.ts';

/** The occurrence indicators, by symbol. */
const OCCURRENCES: ReadonlyMap<string, Occurrence> = new Map([
  ['?', Occurrence.ZERO_OR_ONE],
  ['*', Occurrence.ZERO_OR_MORE],
  ['+', Occurrence.ONE_OR_MORE],
]);

/**
 * Parses a sequence type, such as `xs:integer*` or `empty-sequence()`. An occurrence indicator
 * that follows binds to the type, so `4 treat as item() + - 5` subtracts 5 from `4 treat as item()+`.
 */
export function parseSequenceType(tokens: TokenStream): SequenceTypeSyntax {
  const start = tokens.start;
  if (tokens.atKeywordThen('empty-sequence', '(')) {
    tokens.takeOpening();
    tokens.expectSymbol(')');
    return { kind: 'empty-sequence-type', start, end: tokens.end };
  }
  const itemType = parseItemType(tokens);
  const symbol = tokens.peek();
  const occurrence = symbol.kind === TokenKind.SYMBOL ? OCCURRENCES.get(symbol.text) : undefined;
  if (occurrence !== undefined) tokens.next();
  return {
    kind: 'item-sequence-type',
    itemType,
    occurrence: occurrence ?? Occurrence.EXACTLY_ONE,
    start,
    end: tokens.end,
  };
}

/** Parses an item type: `item()`, a kind test, a function, map or array test, an atomic type, or one in parentheses. */
function parseItemType(tokens: TokenStream): ItemTypeSyntax {
  if (tokens.takeSymbol('(')) {
    const itemType = parseItemType(tokens);
    tokens.expectSymbol(')');
    return itemType;
  }
  if (tokens.atKeywordThen('item', '(')) return parseEmptyTest(tokens, 'any-item-test');
  if (tokens.atKeywordThen('function', '(')) return parseFunctionTest(tokens);
  if (tokens.atKeywordThen('map', '(')) return parseMapTest(tokens);
  if (tokens.atKeywordThen('array', '(')) return parseArrayTest(tokens);
  if (atKindTest(tokens)) return parseKindTest(tokens);
  return parseAtomicOrUnionType(tokens);
}

/** Whether a kind test starts at the current token: its name, then `(`. */
export function atKindTest(tokens: TokenStream): boolean {
  // The `(` first: most names have none after them, and it costs less than the lookup.
  if (!tokens.atSymbol('(', 1)) return false;
  const name = tokens.peek().localName;
  return KIND_TEST_PARSERS.has(name) && tokens.atKeyword(name);
}

/** Parses an atomic or union type's name. */
function parseAtomicOrUnionType(tokens: TokenStream): AtomicOrUnionType {
  const start = tokens.start;
  const name = tokens.expectName('a type');
  return { kind: 'atomic-or-union-type', name, start, end: tokens.end };
}

/** Parses a test written as a keyword and `()`, such as `item()` or `text()`. */
function parseEmptyTest<
  Kind extends 'any-item-test' | 'any-kind-test' | 'comment-test' | 'text-test' | 'namespace-node-test',
>(tokens: TokenStream, kind: Kind): { kind: Kind; start: number; end: number } {
  const start = tokens.takeOpening();
  tokens.expectSymbol(')');
  return { kind, start, end: tokens.end };
}

/** Takes the `*)` that ends `function(*)`, `map(*)` or `array(*)`, if it is there. */
function takeWildcard(tokens: TokenStream): boolean {
  if (!tokens.takeSymbol('*')) return false;
  tokens.expectSymbol(')');
  return true;
}

/** Parses `function(*)` or `function(types) as type`. */
function parseFunctionTest(tokens: TokenStream): ItemTypeSyntax {
  const start = tokens.takeOpening();
  if (takeWildcard(tokens)) return { kind: 'any-function-test', start, end: tokens.end };
  const parameterTypes = tokens.listUntil(')', parseSequenceType);
  tokens.expectKeyword('as');
  const returnType = parseSequenceType(tokens);
  return { kind: 'typed-function-test', parameterTypes, returnType, start, end: tokens.end };
}

/** Parses `map(*)` or `map(key-type, value-type)`. */
function parseMapTest(tokens: TokenStream): ItemTypeSyntax {
  const start = tokens.takeOpening();
  if (takeWildcard(tokens)) return { kind: 'any-map-test', start, end: tokens.end };
  const keyType = parseAtomicOrUnionType(tokens);
  tokens.expectSymbol(',');
  const valueType = parseSequenceType(tokens);
  tokens.expectSymbol(')');
  return { kind: 'typed-map-test', keyType, valueType, start, end: tokens.end };
}

/** Parses `array(*)` or `array(member-type)`. */
function parseArrayTest(tokens: TokenStream): ItemTypeSyntax {
  const start = tokens.takeOpening();
  if (takeWildcard(tokens)) return { kind: 'any-array-test', start, end: tokens.end };
  const memberType = parseSequenceType(tokens);
  tokens.expectSymbol(')');
  return { kind: 'typed-array-test', memberType, start, end: tokens.end };
}

/** The parser of each kind test, by its name, such as `element` in `element(title)`. */
const KIND_TEST_PARSERS: ReadonlyMap<string, (tokens: TokenStream) => KindTest> = new Map<
  string,
  (tokens: TokenStream) => KindTest
>([
  ['node', (tokens) => parseEmptyTest(tokens, 'any-kind-test')],
  ['text', (tokens) => parseEmptyTest(tokens, 'text-test')],
  ['comment', (tokens) => parseEmptyTest(tokens, 'comment-test')],
  ['namespace-node', (tokens) => parseEmptyTest(tokens, 'namespace-node-test')],
  ['document-node', parseDocumentTest],
  ['element', parseElementTest],
  ['attribute', parseAttributeTest],
  ['schema-element', parseSchemaTest],
  ['schema-attribute', parseSchemaTest],
  ['processing-instruction', parseProcessingInstructionTest],
]);

/** Parses a kind test, such as `element(title)` or `processing-instruction()`, at its name. */
export function parseKindTest(tokens: TokenStream): KindTest {
  return (KIND_TEST_PARSERS.get(tokens.peek().localName) as (tokens: TokenStream) => KindTest)(tokens);
}

/** Parses `document-node()`, `document-node(element(...))` or `document-node(schema-element(...))`. */
function parseDocumentTest(tokens: TokenStream): KindTest {
  const start = tokens.takeOpening();
  let elementTest: ElementTest | SchemaElementTest | undefined;
  if (tokens.atKeywordThen('element', '(')) elementTest = parseElementTest(tokens);
  else if (tokens.atKeywordThen('schema-element', '(')) elementTest = parseSchemaTest(tokens) as SchemaElementTest;
  tokens.expectSymbol(')');
  return { kind: 'document-test', elementTest, start, end: tokens.end };
}

/** Parses the name of an element or attribute test, or undefined for `*`. */
function parseNameOrWildcard(tokens: TokenStream): UnresolvedName | undefined {
  return tokens.takeSymbol('*') ? undefined : tokens.expectName('a name or "*"');
}

/** The parts of an element or attribute test: its start, its name or undefined for any, its type, and a `?` after it. */
interface NodeTestParts {
  readonly start: number;
  readonly name: UnresolvedName | undefined;
  readonly typeName: UnresolvedName | undefined;
  readonly nillable: boolean;
}

/** Parses an element or attribute test up to its `)`, taking a `?` after the type only for an element. */
function parseNodeTestParts(tokens: TokenStream, allowsNillable: boolean): NodeTestParts {
  const start = tokens.takeOpening();
  let name: UnresolvedName | undefined;
  let typeName: UnresolvedName | undefined;
  let nillable = false;
  if (!tokens.atSymbol(')')) {
    name = parseNameOrWildcard(tokens);
    if (tokens.takeSymbol(',')) {
      typeName = tokens.expectName('a type');
      nillable = allowsNillable && tokens.takeSymbol('?');
    }
  }
  tokens.expectSymbol(')');
  return { start, name, typeName, nillable };
}

/** Parses `element()`, `element(name)`, `element(name, type)` or `element(name, type?)`. */
function parseElementTest(tokens: TokenStream): ElementTest {
  const { start, name, typeName, nillable } = parseNodeTestParts(tokens, true);
  return { kind: 'element-test', name, typeName, nillable, start, end: tokens.end };
}

/** Parses `attribute()`, `attribute(name)` or `attribute(name, type)`. */
function parseAttributeTest(tokens: TokenStream): KindTest {
  const { start, name, typeName } = parseNodeTestParts(tokens, false);
  return { kind: 'attribute-test', name, typeName, start, end: tokens.end };
}

/** Parses `schema-element(name)` or `schema-attribute(name)`. */
function parseSchemaTest(tokens: TokenStream): KindTest {
  const kind = tokens.peek().localName === 'schema-element' ? 'schema-element-test' : 'schema-attribute-test';
  const start = tokens.takeOpening();
  const name = tokens.expectName();
  tokens.expectSymbol(')');
  return { kind, name, start, end: tokens.end };
}

/**
 * Parses `processing-instruction()`, or with a target as a name or a string. A string target is
 * whitespace-normalized and must then be a name without a colon, or the test raises XPTY0004.
 */
function parseProcessingInstructionTest(tokens: TokenStream): KindTest {
  const start = tokens.takeOpening();
  let target: string | undefined;
  const token = tokens.peek();
  if (token.kind === TokenKind.STRING) {
    tokens.next();
    target = collapseWhitespace(token.text);
    if (!isNcName(target))
      xpathError(
        XPathErrorCode.TYPE_MISMATCH,
        `"${target}" is not a valid processing instruction target`,
        token,
        tokens.text
      );
  } else if (!tokens.atSymbol(')')) target = tokens.expectNcName('a target name or a string');
  tokens.expectSymbol(')');
  return { kind: 'processing-instruction-test', target, start, end: tokens.end };
}

/** Parses the type of a cast: an atomic type's name and an optional `?`. */
export function parseSingleType(tokens: TokenStream): SingleType {
  const start = tokens.start;
  const name = tokens.expectName('a type');
  const allowsEmpty = tokens.takeSymbol('?');
  return { kind: 'single-type', name, allowsEmpty, start, end: tokens.end };
}
