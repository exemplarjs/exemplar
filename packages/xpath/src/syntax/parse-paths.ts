import { Axis } from '@exemplarjs/xdm';
import { parseExpression } from './parse-expressions.ts';
import { parsePostfixExpression } from './parse-primaries.ts';
import { atKindTest, parseKindTest } from './parse-types.ts';
import type { AxisName, AxisStep, Expression, NodeTestSyntax } from './syntax-tree.ts';
import { isNcNameToken, nameOf, type TokenStream } from './token-stream.ts';
import { type Token, TokenKind } from './tokens.ts';

/** Every axis name. */
const AXES: ReadonlySet<string> = new Set(Object.values(Axis));

/** The symbols that can start a relative path, besides names, wildcards and literals. */
const PATH_START_SYMBOLS: ReadonlySet<string> = new Set(['*', '@', '.', '..', '$', '(', '?', '[']);

/** The kinds of token that can start a relative path. */
const PATH_START_TOKENS: ReadonlySet<string> = new Set<string>([
  TokenKind.NAME,
  TokenKind.NAMESPACE_WILDCARD,
  TokenKind.LOCAL_NAME_WILDCARD,
  TokenKind.INTEGER,
  TokenKind.DECIMAL,
  TokenKind.DOUBLE,
  TokenKind.STRING,
]);

/** Whether a relative path can start at the current token. */
function startsRelativePath(tokens: TokenStream): boolean {
  const token = tokens.peek();
  return PATH_START_TOKENS.has(token.kind) || (token.kind === TokenKind.SYMBOL && PATH_START_SYMBOLS.has(token.text));
}

/** The step `descendant-or-self::node()` that `//` stands for, spanning the `//`. */
function descendantOrSelfStep(token: Token): AxisStep {
  const { start, end } = token;
  return {
    kind: 'axis-step',
    axis: 'descendant-or-self',
    nodeTest: { kind: 'any-kind-test', start, end },
    predicates: [],
    start,
    end,
  };
}

/**
 * Parses a path: `/`, `/a`, `//a` or a relative path such as `a/b`. A lone `/` is the root only
 * when no relative path can follow it, so `/ * 5` is the path `/*` followed by a stray `5`.
 */
export function parsePathExpression(tokens: TokenStream): Expression {
  const start = tokens.start;
  const steps: Expression[] = [];
  if (tokens.atSymbol('/')) {
    const slash = tokens.next();
    steps.push({ kind: 'root', start: slash.start, end: slash.end });
    if (!startsRelativePath(tokens)) return steps[0] as Expression;
  } else if (tokens.atSymbol('//')) {
    const slashes = tokens.next();
    steps.push({ kind: 'root', start: slashes.start, end: slashes.end }, descendantOrSelfStep(slashes));
  }
  parseRelativeSteps(tokens, steps);
  return steps.length === 1 ? (steps[0] as Expression) : { kind: 'path', steps, start, end: tokens.end };
}

/** Parses steps separated by `/` or `//` onto a list of steps. */
function parseRelativeSteps(tokens: TokenStream, steps: Expression[]): void {
  steps.push(parseStepExpression(tokens));
  for (;;) {
    if (tokens.atSymbol('//')) steps.push(descendantOrSelfStep(tokens.next()));
    else if (!tokens.takeSymbol('/')) return;
    steps.push(parseStepExpression(tokens));
  }
}

/** Parses a step: an axis step, abbreviated or not, or a postfix expression such as `$a[1]` or `f()`. */
function parseStepExpression(tokens: TokenStream): Expression {
  const token = tokens.peek();
  const start = token.start;
  switch (token.kind) {
    case TokenKind.NAMESPACE_WILDCARD:
    case TokenKind.LOCAL_NAME_WILDCARD: {
      return parseAxisStepRest(tokens, start, 'child', parseNodeTest(tokens));
    }
    case TokenKind.NAME: {
      return parseNamedStep(tokens);
    }
    case TokenKind.SYMBOL: {
      if (tokens.takeSymbol('@')) return parseAxisStepRest(tokens, start, 'attribute', parseNodeTest(tokens));
      if (tokens.takeSymbol('..')) {
        const nodeTest: NodeTestSyntax = { kind: 'any-kind-test', start, end: token.end };
        return parseAxisStepRest(tokens, start, 'parent', nodeTest);
      }
      if (token.text === '*') return parseAxisStepRest(tokens, start, 'child', parseNodeTest(tokens));
      return parsePostfixExpression(tokens);
    }
    default: {
      return parsePostfixExpression(tokens);
    }
  }
}

/** Parses a step that starts with a name: an axis, a kind test, a name test, or a call or constructor. */
function parseNamedStep(tokens: TokenStream): Expression {
  const token = tokens.peek();
  const start = token.start;
  if (tokens.atSymbol('::', 1)) {
    if (!isNcNameToken(token) || !AXES.has(token.localName)) tokens.fail('Expected an axis name');
    tokens.next();
    tokens.next();
    return parseAxisStepRest(tokens, start, token.localName as AxisName, parseNodeTest(tokens));
  }
  if (atKindTest(tokens)) {
    const nodeTest = parseKindTest(tokens);
    return parseAxisStepRest(tokens, start, defaultAxis(nodeTest), nodeTest);
  }
  if (startsNamedPrimary(tokens)) return parsePostfixExpression(tokens);
  return parseAxisStepRest(tokens, start, 'child', parseNodeTest(tokens));
}

/** Whether the name at the current token starts a function call, function reference or constructor. */
function startsNamedPrimary(tokens: TokenStream): boolean {
  if (tokens.atSymbol('(', 1) || tokens.atSymbol('#', 1)) return true;
  return tokens.atKeywordThen('map', '{') || tokens.atKeywordThen('array', '{');
}

/** The axis of a step written without one: `attribute` for attribute tests, `namespace` for `namespace-node()`, else `child`. */
function defaultAxis(nodeTest: NodeTestSyntax): AxisName {
  if (nodeTest.kind === 'attribute-test' || nodeTest.kind === 'schema-attribute-test') return 'attribute';
  return nodeTest.kind === 'namespace-node-test' ? 'namespace' : 'child';
}

/** Parses a node test: a kind test, a name, or a wildcard. */
function parseNodeTest(tokens: TokenStream): NodeTestSyntax {
  if (atKindTest(tokens)) return parseKindTest(tokens);
  const token = tokens.peek();
  const span = { start: token.start, end: token.end };
  switch (token.kind) {
    case TokenKind.NAME: {
      tokens.next();
      return { kind: 'name-test', name: nameOf(token), ...span };
    }
    case TokenKind.NAMESPACE_WILDCARD: {
      tokens.next();
      return { kind: 'namespace-test', prefix: token.prefix, namespaceURI: token.namespaceURI, ...span };
    }
    case TokenKind.LOCAL_NAME_WILDCARD: {
      tokens.next();
      return { kind: 'local-name-test', localName: token.localName, ...span };
    }
    default: {
      if (!tokens.takeSymbol('*')) tokens.fail('Expected a name test or kind test');
      return { kind: 'any-name-test', ...span };
    }
  }
}

/** Parses the predicates of an axis step whose axis and node test have been read. */
function parseAxisStepRest(tokens: TokenStream, start: number, axis: AxisName, nodeTest: NodeTestSyntax): AxisStep {
  const predicates: Expression[] = [];
  while (tokens.takeSymbol('[')) {
    predicates.push(parseExpression(tokens));
    tokens.expectSymbol(']');
  }
  return { kind: 'axis-step', axis, nodeTest, predicates, start, end: tokens.end };
}
