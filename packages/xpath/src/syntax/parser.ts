import { parseExpression } from './parse-expressions.ts';
import type { Expression } from './syntax-tree.ts';
import { TokenStream } from './token-stream.ts';

/**
 * Parses an XPath 3.1 expression into its syntax tree, raising XPST0003 with the position of the
 * first error. Names stay as written; prefixes, variables and functions are resolved later.
 *
 * @example
 * parseXPath('//book[price > 10]'); // a path: the root, descendant-or-self::node(), then child::book with a predicate
 */
export function parseXPath(text: string): Expression {
  const tokens = new TokenStream(text);
  const expression = parseExpression(tokens);
  if (!tokens.atEnd) tokens.fail('Expected an operator or the end of the expression');
  return expression;
}
