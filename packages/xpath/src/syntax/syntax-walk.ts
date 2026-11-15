import type { UnresolvedName } from './syntax-tree.ts';

/** The kinds of syntax that name a function statically: calls, arrows and `name#arity`. */
const CALL_KINDS = new Set(['function-call', 'static-arrow', 'named-function-reference']);

/** Whether a value is a list or a plain object, as syntax nodes are, rather than a value such as a literal's. */
function isSyntax(value: unknown): value is object {
  return (
    typeof value === 'object' &&
    value !== null &&
    (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)
  );
}

/** The first function a syntax tree calls or names that passes a test, by a walk that stops there; undefined for none. */
export function findFunctionName(node: object, test: (name: UnresolvedName) => boolean): UnresolvedName | undefined {
  if (Array.isArray(node)) {
    // Every list in a syntax tree holds syntax nodes.
    for (const item of node as readonly object[]) {
      const found = findFunctionName(item, test);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const syntax = node as { readonly kind?: unknown; readonly name?: UnresolvedName };
  if (CALL_KINDS.has(syntax.kind as string) && test(syntax.name as UnresolvedName)) return syntax.name;
  for (const key in node) {
    const value = (node as Record<string, unknown>)[key];
    const found = isSyntax(value) ? findFunctionName(value, test) : undefined;
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Every function a syntax tree calls or names, in the order they are written. */
export function functionNames(node: object): UnresolvedName[] {
  const names: UnresolvedName[] = [];
  findFunctionName(node, (name) => {
    names.push(name);
    return false;
  });
  return names;
}
