import type { XdmValue } from '@exemplarjs/xdm';
import type { DynamicContext } from '@/runtime/dynamic-context';
import type { Pausable } from '@/runtime/pausing';
import { ANY_SEQUENCE, NONE, type SequenceTypeMatcher } from '@/static/matchers';
import { resolveFunctionName } from '@/static/name-resolution';
import { DEFAULT_NAMESPACES, type NamespaceContext } from '@/static/static-context';
import { compileSequenceType, sequenceTypeFromText } from '@/static/type-resolution';
import { parseSequenceType } from '@/syntax/parse-types';
import { TokenStream } from '@/syntax/token-stream';
import type { FunctionDefinition, FunctionImplementation } from './function-library.ts';

/** The namespace a prefix in a signature is bound to: one of the default namespaces. */
function signaturePrefix(prefix: string): string | undefined {
  return DEFAULT_NAMESPACES[prefix];
}

/** The namespaces signatures are written with. */
function signatureContext(text: string): NamespaceContext {
  return { text, defaultElementNamespace: '', resolvePrefix: signaturePrefix };
}

/** Reads a signature's parameters, each `$name as type`, and whether `...` follows the last to make it repeat. */
function readParameters(
  tokens: TokenStream,
  context: NamespaceContext
): { types: SequenceTypeMatcher[]; variadic: boolean } {
  const types: SequenceTypeMatcher[] = [];
  tokens.expectSymbol('(');
  let variadic = false;
  while (!tokens.atSymbol(')')) {
    if (tokens.takeSymbol('..')) {
      tokens.expectSymbol('.');
      variadic = true;
      break;
    }
    tokens.expectSymbol('$');
    tokens.expectName();
    tokens.expectKeyword('as');
    types.push(compileSequenceType(parseSequenceType(tokens), context));
    tokens.takeSymbol(',');
  }
  tokens.expectSymbol(')');
  return { types, variadic };
}

/** The sequence types made in code, by their text, each compiled once. */
const SEQUENCE_TYPES = new Map<string, SequenceTypeMatcher>();

/** A sequence type written as signatures write it, such as `map(*)`, for the types of functions made in code. */
export function sequenceTypeOf(text: string): SequenceTypeMatcher {
  let type = SEQUENCE_TYPES.get(text);
  if (type === undefined) {
    type = sequenceTypeFromText(text, signaturePrefix);
    SEQUENCE_TYPES.set(text, type);
  }
  return type;
}

/** A signature with one more parameter after the others, such as `$collation as xs:string`. */
export function withLastParameter(signature: string, parameter: string): string {
  const close = signature.lastIndexOf(') as ');
  return `${signature.slice(0, close)}, ${parameter}${signature.slice(close)}`;
}

/** A signature's result type: a sequence type, or `none` for a function that never returns. */
function readReturnType(tokens: TokenStream, context: NamespaceContext): SequenceTypeMatcher {
  return tokens.takeKeyword('none') ? NONE : compileSequenceType(parseSequenceType(tokens), context);
}

/**
 * A function from its signature, written as F&O writes it, and what it does. An unprefixed name
 * is in the `fn` namespace; `...` after the last parameter makes it repeat; the result type
 * follows `as`, `item()*` when it is not given.
 *
 * @example
 * defineFunction('fn:abs($arg as xs:numeric?) as xs:numeric?', ([arg]) => ...);
 */
export function defineFunction(signature: string, implementation: FunctionImplementation): FunctionDefinition {
  const tokens = new TokenStream(signature);
  const context = signatureContext(signature);
  const name = resolveFunctionName(tokens.expectName(), context);
  const { types, variadic } = readParameters(tokens, context);
  const returnType = tokens.takeKeyword('as') ? readReturnType(tokens, context) : ANY_SEQUENCE;
  return {
    namespaceURI: name.namespaceURI,
    localName: name.localName,
    parameterTypes: types,
    returnType,
    variadic,
    implementation,
  };
}

/**
 * A function that needs only so many first items of its first argument, or only their count: a
 * call reads no more of it, so `exists(//x)` stops at the first `x`.
 *
 * @example
 * defineLazyFunction(1, 'fn:exists($arg as item()*) as xs:boolean', ([arg = []]) => ...);
 */
export function defineLazyFunction(
  lazyFirst: number | 'count',
  signature: string,
  implementation: FunctionImplementation
): FunctionDefinition {
  return { ...defineFunction(signature, implementation), lazyFirst };
}

/** A function defined twice: by its signature, and with one more parameter after the others, its argument given or undefined. */
export function defineWithLast(
  signature: string,
  parameter: string,
  implementation: (args: readonly XdmValue[], last: XdmValue | undefined, context: DynamicContext) => Pausable<XdmValue>
): FunctionDefinition[] {
  return [
    defineFunction(signature, (args, context) => implementation(args, undefined, context)),
    defineFunction(withLastParameter(signature, parameter), (args, context) =>
      implementation(args.slice(0, -1), args.at(-1), context)
    ),
  ];
}
