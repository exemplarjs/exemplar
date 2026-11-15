import { parsePathExpression } from './parse-paths.ts';
import { parseArgumentList, parseArrowTarget } from './parse-primaries.ts';
import { parseSequenceType, parseSingleType } from './parse-types.ts';
import type { Expression, VariableBinding } from './syntax-tree.ts';
import { isNcNameToken, type TokenStream } from './token-stream.ts';
import { TokenKind } from './tokens.ts';

/** Parses `Expr`: one or more expressions separated by commas, a sequence when there are several. */
export function parseExpression(tokens: TokenStream): Expression {
  const start = tokens.start;
  const first = parseExpressionSingle(tokens);
  if (!tokens.atSymbol(',')) return first;
  const items = [first];
  while (tokens.takeSymbol(',')) items.push(parseExpressionSingle(tokens));
  return { kind: 'sequence', items, start, end: tokens.end };
}

/** Parses `ExprSingle`: a `for`, `let`, `some`, `every` or `if` expression, or an `or` expression. */
export function parseExpressionSingle(tokens: TokenStream): Expression {
  if (tokens.atSymbol('$', 1)) {
    if (tokens.atKeyword('for')) return parseBindingExpression(tokens, 'for');
    if (tokens.atKeyword('let')) return parseBindingExpression(tokens, 'let');
    if (tokens.atKeyword('some') || tokens.atKeyword('every')) return parseQuantified(tokens);
  }
  if (tokens.atKeywordThen('if', '(')) return parseIf(tokens);
  return parseBinary(tokens, Precedence.OR);
}

/** Parses the bindings of a `for`, `some` or `every` (`$a in x, ...`) or of a `let` (`$a := x, ...`). */
function parseBindings(tokens: TokenStream, separator: 'in' | ':='): VariableBinding[] {
  const bindings: VariableBinding[] = [];
  do {
    const start = tokens.start;
    tokens.expectSymbol('$');
    const name = tokens.expectName('a variable name');
    if (separator === 'in') tokens.expectKeyword('in');
    else tokens.expectSymbol(':=');
    const expression = parseExpressionSingle(tokens);
    bindings.push({ name, expression, start, end: tokens.end });
  } while (tokens.takeSymbol(','));
  return bindings;
}

/** Parses `for $a in x, ... return body` or `let $a := x, ... return body`. */
function parseBindingExpression(tokens: TokenStream, kind: 'for' | 'let'): Expression {
  const start = tokens.start;
  tokens.next();
  const bindings = parseBindings(tokens, kind === 'for' ? 'in' : ':=');
  tokens.expectKeyword('return');
  const body = parseExpressionSingle(tokens);
  return { kind, bindings, body, start, end: tokens.end };
}

/** Parses `some $a in x, ... satisfies condition`, or `every`. */
function parseQuantified(tokens: TokenStream): Expression {
  const start = tokens.start;
  const quantifier = tokens.next().localName === 'some' ? 'some' : 'every';
  const bindings = parseBindings(tokens, 'in');
  tokens.expectKeyword('satisfies');
  const condition = parseExpressionSingle(tokens);
  return { kind: 'quantified', quantifier, bindings, condition, start, end: tokens.end };
}

/** Parses `if (condition) then a else b`. */
function parseIf(tokens: TokenStream): Expression {
  const start = tokens.start;
  tokens.next();
  tokens.expectSymbol('(');
  const condition = parseExpression(tokens);
  tokens.expectSymbol(')');
  tokens.expectKeyword('then');
  const thenExpression = parseExpressionSingle(tokens);
  tokens.expectKeyword('else');
  const elseExpression = parseExpressionSingle(tokens);
  return { kind: 'if', condition, thenExpression, elseExpression, start, end: tokens.end };
}

/** A binary operator: the kind of expression it makes and how tightly it binds. */
interface BinaryOperator {
  readonly kind: 'logical' | 'comparison' | 'string-concatenation' | 'range' | 'arithmetic' | 'set-operation';
  readonly operator: string;
  /** One of the `Precedence` levels; higher binds tighter. */
  readonly precedence: number;
}

/** How tightly each level of binary operator binds; higher binds tighter. */
const Precedence = {
  OR: 1,
  AND: 2,
  COMPARISON: 3,
  CONCATENATION: 4,
  RANGE: 5,
  ADDITIVE: 6,
  MULTIPLICATIVE: 7,
  UNION: 8,
  INTERSECT_EXCEPT: 9,
} as const;

/** A binary operator of a kind, as written. */
function binary(kind: BinaryOperator['kind'], operator: string, precedence: number): BinaryOperator {
  return { kind, operator, precedence };
}

/** The binary operators written as symbols. */
const SYMBOL_OPERATORS: ReadonlyMap<string, BinaryOperator> = new Map([
  ...['=', '!=', '<', '<=', '>', '>=', '<<', '>>'].map(
    (symbol) => [symbol, binary('comparison', symbol, Precedence.COMPARISON)] as const
  ),
  ['||', binary('string-concatenation', '||', Precedence.CONCATENATION)],
  ['+', binary('arithmetic', '+', Precedence.ADDITIVE)],
  ['-', binary('arithmetic', '-', Precedence.ADDITIVE)],
  ['*', binary('arithmetic', '*', Precedence.MULTIPLICATIVE)],
  ['|', binary('set-operation', 'union', Precedence.UNION)],
]);

/** The binary operators written as keywords. */
const KEYWORD_OPERATORS: ReadonlyMap<string, BinaryOperator> = new Map([
  ['or', binary('logical', 'or', Precedence.OR)],
  ['and', binary('logical', 'and', Precedence.AND)],
  ...['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'is'].map(
    (keyword) => [keyword, binary('comparison', keyword, Precedence.COMPARISON)] as const
  ),
  ['to', binary('range', 'to', Precedence.RANGE)],
  ...['div', 'idiv', 'mod'].map(
    (keyword) => [keyword, binary('arithmetic', keyword, Precedence.MULTIPLICATIVE)] as const
  ),
  ['union', binary('set-operation', 'union', Precedence.UNION)],
  ['intersect', binary('set-operation', 'intersect', Precedence.INTERSECT_EXCEPT)],
  ['except', binary('set-operation', 'except', Precedence.INTERSECT_EXCEPT)],
]);

/** The binary operator at the current token, or undefined. */
function binaryOperatorAt(tokens: TokenStream): BinaryOperator | undefined {
  const token = tokens.peek();
  if (token.kind === TokenKind.SYMBOL) return SYMBOL_OPERATORS.get(token.text);
  if (token.kind !== TokenKind.NAME || !isNcNameToken(token)) return undefined;
  return KEYWORD_OPERATORS.get(token.localName);
}

/**
 * Parses the binary operators from `or` to `intersect`, each operand a type operation, taking
 * only operators that bind at least as tightly as `minimum`: `a or b and c = d + e * f` is
 * `a or (b and (c = (d + (e * f))))`.
 */
function parseBinary(tokens: TokenStream, minimum: number): Expression {
  const start = tokens.start;
  let left = parseTypeOperations(tokens);
  // A comparison or range stops any operator of its own precedence from following it, as `a + b + c` may.
  let ceiling = Number.POSITIVE_INFINITY;
  for (;;) {
    const operator = binaryOperatorAt(tokens);
    if (operator === undefined || operator.precedence < minimum || operator.precedence >= ceiling) return left;
    tokens.next();
    const right = parseBinary(tokens, operator.precedence + 1);
    left = binaryExpression(operator, left, right, start, tokens.end);
    if (operator.kind === 'comparison' || operator.kind === 'range') ceiling = operator.precedence;
  }
}

/** The expression a binary operator makes of its operands, spanning the offsets from `start` to `end`. */
function binaryExpression(
  operator: BinaryOperator,
  left: Expression,
  right: Expression,
  start: number,
  end: number
): Expression {
  const { kind } = operator;
  if (kind === 'string-concatenation' || kind === 'range') return { kind, left, right, start, end };
  return { kind, operator: operator.operator, left, right, start, end } as Expression;
}

/** The type operations, in the order they may follow an arrow expression: their two keywords, their kind, and how their type is read. */
const TYPE_OPERATIONS = [
  { keyword: 'cast', followedBy: 'as', kind: 'cast-as', parseType: parseSingleType },
  { keyword: 'castable', followedBy: 'as', kind: 'castable-as', parseType: parseSingleType },
  { keyword: 'treat', followedBy: 'as', kind: 'treat-as', parseType: parseSequenceType },
  { keyword: 'instance', followedBy: 'of', kind: 'instance-of', parseType: parseSequenceType },
] as const;

/** A type operation such as `instance of`. */
type TypeOperation = (typeof TYPE_OPERATIONS)[number];

/** Parses an arrow expression, then any `cast as`, `castable as`, `treat as` and `instance of`, each at most once, in that order. */
function parseTypeOperations(tokens: TokenStream): Expression {
  const start = tokens.start;
  let operand = parseArrow(tokens);
  if (tokens.peek().kind !== TokenKind.NAME) return operand;
  for (const operation of TYPE_OPERATIONS) operand = withTypeOperation(tokens, start, operand, operation);
  return operand;
}

/** The operand with a type operation such as `instance of type` applied, when its two keywords come next. */
function withTypeOperation(
  tokens: TokenStream,
  start: number,
  operand: Expression,
  { keyword, followedBy, kind, parseType }: TypeOperation
): Expression {
  if (!(tokens.atKeyword(keyword) && tokens.atKeyword(followedBy, 1))) return operand;
  tokens.next();
  tokens.next();
  return { kind, operand, type: parseType(tokens), start, end: tokens.end } as Expression;
}

/** Parses `a => f(b) => ...`, where each function is a name, a variable or an expression in parentheses. */
function parseArrow(tokens: TokenStream): Expression {
  const start = tokens.start;
  let operand = parseUnary(tokens);
  while (tokens.takeSymbol('=>')) {
    if (tokens.peek().kind === TokenKind.NAME) {
      const name = tokens.expectName();
      const argumentList = parseArgumentList(tokens);
      operand = { kind: 'static-arrow', operand, name, arguments: argumentList, start, end: tokens.end };
    } else {
      const target = parseArrowTarget(tokens);
      const argumentList = parseArgumentList(tokens);
      operand = { kind: 'dynamic-arrow', operand, function: target, arguments: argumentList, start, end: tokens.end };
    }
  }
  return operand;
}

/** Parses `-a`, `+a`, or any run of signs, then a simple map expression. */
function parseUnary(tokens: TokenStream): Expression {
  const start = tokens.start;
  if (!(tokens.atSymbol('-') || tokens.atSymbol('+'))) return parseSimpleMap(tokens);
  const operator = tokens.next().text as '+' | '-';
  const operand = parseUnary(tokens);
  return { kind: 'unary', operator, operand, start, end: tokens.end };
}

/** Parses `a ! b ! ...`. */
function parseSimpleMap(tokens: TokenStream): Expression {
  const start = tokens.start;
  let left = parsePathExpression(tokens);
  while (tokens.takeSymbol('!')) {
    const right = parsePathExpression(tokens);
    left = { kind: 'simple-map', left, right, start, end: tokens.end };
  }
  return left;
}
