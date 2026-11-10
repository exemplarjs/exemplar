import { Decimal, XdmAtomicValue } from '@exemplarjs/xdm';
import { XPathErrorCode, xpathError } from '@/api/xpath-exception';
import { parseExpression, parseExpressionSingle } from './parse-expressions.ts';
import { parseSequenceType } from './parse-types.ts';
import type { Argument, Expression, LookupKey, MapEntry, Parameter, SequenceTypeSyntax } from './syntax-tree.ts';
import { isNcNameToken, type TokenStream } from './token-stream.ts';
import { type Token, TokenKind } from './tokens.ts';

/** The names a function call or reference cannot use without a prefix, as they start other expressions (XPath A.3). */
const RESERVED_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  'array',
  'attribute',
  'comment',
  'document-node',
  'element',
  'empty-sequence',
  'function',
  'if',
  'item',
  'map',
  'namespace-node',
  'node',
  'processing-instruction',
  'schema-attribute',
  'schema-element',
  'switch',
  'text',
  'typeswitch',
]);

/** Parses a primary expression and the predicates, argument lists and lookups that follow it. */
export function parsePostfixExpression(tokens: TokenStream): Expression {
  const start = tokens.start;
  let base = parsePrimary(tokens);
  for (;;) {
    if (tokens.takeSymbol('[')) {
      const predicate = parseExpression(tokens);
      tokens.expectSymbol(']');
      base = { kind: 'filter', base, predicate, start, end: tokens.end };
    } else if (tokens.atSymbol('(')) {
      const argumentList = parseArgumentList(tokens);
      base = { kind: 'dynamic-call', function: base, arguments: argumentList, start, end: tokens.end };
    } else if (tokens.takeSymbol('?')) {
      const key = parseLookupKey(tokens);
      base = { kind: 'lookup', base, key, start, end: tokens.end };
    } else return base;
  }
}

/** Parses a primary expression: a literal, variable, parenthesized expression, `.`, call, function, constructor or unary lookup. */
function parsePrimary(tokens: TokenStream): Expression {
  const token = tokens.peek();
  if (token.kind === TokenKind.NAME) return parseNamedPrimary(tokens);
  if (token.kind !== TokenKind.SYMBOL) return parseLiteral(tokens);
  const start = token.start;
  switch (token.text) {
    case '$': {
      return parseVariableReference(tokens);
    }
    case '(': {
      return parseParenthesized(tokens);
    }
    case '.': {
      tokens.next();
      return { kind: 'context-item', start, end: tokens.end };
    }
    case '?': {
      tokens.next();
      const key = parseLookupKey(tokens);
      return { kind: 'unary-lookup', key, start, end: tokens.end };
    }
    case '[': {
      return parseSquareArray(tokens);
    }
    default: {
      return tokens.fail('Expected an expression');
    }
  }
}

/** The value a numeric or string literal token stands for. */
function literalValue(token: Token): XdmAtomicValue {
  switch (token.kind) {
    case TokenKind.INTEGER: {
      return XdmAtomicValue.integer(BigInt(token.text));
    }
    case TokenKind.DECIMAL: {
      return XdmAtomicValue.decimal(Decimal.parse(token.text) as Decimal);
    }
    case TokenKind.DOUBLE: {
      return XdmAtomicValue.double(Number(token.text));
    }
    default: {
      return XdmAtomicValue.string(token.text);
    }
  }
}

/** Parses a numeric or string literal. */
function parseLiteral(tokens: TokenStream): Expression {
  const token = tokens.peek();
  if (
    token.kind === TokenKind.END ||
    token.kind === TokenKind.NAMESPACE_WILDCARD ||
    token.kind === TokenKind.LOCAL_NAME_WILDCARD
  )
    tokens.fail('Expected an expression');
  tokens.next();
  return { kind: 'literal', value: literalValue(token), start: token.start, end: token.end };
}

/** Parses `$name`. */
function parseVariableReference(tokens: TokenStream): Expression {
  const start = tokens.start;
  tokens.expectSymbol('$');
  const name = tokens.expectName('a variable name');
  return { kind: 'variable-reference', name, start, end: tokens.end };
}

/** Parses `(expression)` as the expression, and `()` or `(a, b)` as a sequence spanning the parentheses. */
function parseParenthesized(tokens: TokenStream): Expression {
  const start = tokens.start;
  const expression = parseDelimited(tokens, '(', ')');
  return expression.kind === 'sequence' ? { ...expression, start, end: tokens.end } : expression;
}

/** Parses a primary that starts with a name: a call, a function reference, an inline function, or a map or array constructor. */
function parseNamedPrimary(tokens: TokenStream): Expression {
  if (tokens.atKeywordThen('function', '(')) return parseInlineFunction(tokens);
  if (tokens.atKeywordThen('map', '{')) return parseMapConstructor(tokens);
  if (tokens.atKeywordThen('array', '{')) return parseCurlyArray(tokens);
  const token = tokens.peek();
  const start = token.start;
  if (isNcNameToken(token) && RESERVED_FUNCTION_NAMES.has(token.localName))
    xpathError(
      XPathErrorCode.SYNTAX_ERROR,
      `"${token.localName}" cannot name a function without a prefix`,
      token,
      tokens.text
    );
  const name = tokens.expectName();
  if (tokens.takeSymbol('#')) {
    const arity = tokens.peek();
    if (arity.kind !== TokenKind.INTEGER) tokens.fail('Expected an arity');
    tokens.next();
    return { kind: 'named-function-reference', name, arity: Number(arity.text), start, end: tokens.end };
  }
  const argumentList = parseArgumentList(tokens);
  return { kind: 'function-call', name, arguments: argumentList, start, end: tokens.end };
}

/** Parses `(a, ?, b)`: arguments, where a lone `?` is a placeholder. */
export function parseArgumentList(tokens: TokenStream): Argument[] {
  tokens.expectSymbol('(');
  return tokens.listUntil(')', (inner): Argument => {
    const isPlaceholder = inner.atSymbol('?') && (inner.atSymbol(',', 1) || inner.atSymbol(')', 1));
    if (!isPlaceholder) return parseExpressionSingle(inner);
    const token = inner.next();
    return { kind: 'argument-placeholder', start: token.start, end: token.end };
  });
}

/** Parses the function of a dynamic arrow, `=> $f(...)` or `=> (expression)(...)`: a variable or a parenthesized expression. */
export function parseArrowTarget(tokens: TokenStream): Expression {
  if (tokens.atSymbol('$')) return parseVariableReference(tokens);
  if (tokens.atSymbol('(')) return parseParenthesized(tokens);
  return tokens.fail('Expected a function name, a variable or a parenthesized expression after "=>"');
}

/** Parses a lookup's key: a name or integer, which stand for themselves as literals, an expression in parentheses, or `*`. */
function parseLookupKey(tokens: TokenStream): LookupKey {
  const token = tokens.peek();
  if (token.kind === TokenKind.NAME && isNcNameToken(token)) {
    tokens.next();
    return { kind: 'literal', value: XdmAtomicValue.string(token.localName), start: token.start, end: token.end };
  }
  if (token.kind === TokenKind.INTEGER) return parseLiteral(tokens);
  if (tokens.atSymbol('(')) return parseParenthesized(tokens);
  if (tokens.takeSymbol('*')) return '*';
  return tokens.fail('Expected a key after "?"');
}

/** Parses `function($a as type, ...) as type { body }`. */
function parseInlineFunction(tokens: TokenStream): Expression {
  const start = tokens.takeOpening();
  const parameters = tokens.listUntil(')', parseParameter);
  const returnType = parseTypeDeclaration(tokens);
  const body = parseEnclosedExpression(tokens);
  return { kind: 'inline-function', parameters, returnType, body, start, end: tokens.end };
}

/** Parses one parameter, `$name` or `$name as type`. */
function parseParameter(tokens: TokenStream): Parameter {
  const start = tokens.start;
  tokens.expectSymbol('$');
  const name = tokens.expectName('a parameter name');
  const type = parseTypeDeclaration(tokens);
  return { name, type, start, end: tokens.end };
}

/** Parses `as type` when it comes next. */
function parseTypeDeclaration(tokens: TokenStream): SequenceTypeSyntax | undefined {
  return tokens.takeKeyword('as') ? parseSequenceType(tokens) : undefined;
}

/** Parses `{ expression }`, with `{}` the empty sequence. */
function parseEnclosedExpression(tokens: TokenStream): Expression {
  return parseDelimited(tokens, '{', '}');
}

/** Parses an expression between `open` and `close`, with nothing between them the empty sequence spanning both. */
function parseDelimited(tokens: TokenStream, open: string, close: string): Expression {
  const start = tokens.start;
  tokens.expectSymbol(open);
  if (tokens.takeSymbol(close)) return { kind: 'sequence', items: [], start, end: tokens.end };
  const expression = parseExpression(tokens);
  tokens.expectSymbol(close);
  return expression;
}

/** Parses `map { key : value, ... }`. */
function parseMapConstructor(tokens: TokenStream): Expression {
  const start = tokens.start;
  tokens.next();
  tokens.expectSymbol('{');
  const entries = tokens.listUntil('}', (inner): MapEntry => {
    const key = parseExpressionSingle(inner);
    inner.expectSymbol(':');
    return { key, value: parseExpressionSingle(inner) };
  });
  return { kind: 'map-constructor', entries, start, end: tokens.end };
}

/** Parses `[a, b, ...]`. */
function parseSquareArray(tokens: TokenStream): Expression {
  const start = tokens.start;
  tokens.expectSymbol('[');
  const members = tokens.listUntil(']', parseExpressionSingle);
  return { kind: 'square-array-constructor', members, start, end: tokens.end };
}

/** Parses `array { expression }`. */
function parseCurlyArray(tokens: TokenStream): Expression {
  const start = tokens.start;
  tokens.next();
  const content = parseEnclosedExpression(tokens);
  return { kind: 'curly-array-constructor', content, start, end: tokens.end };
}
