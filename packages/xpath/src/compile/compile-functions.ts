import type { XdmValue } from '@exemplarjs/xdm';
import { XPathErrorCode } from '@/api/xpath-exception';
import { convertArgument } from '@/functions/function-conversion';
import { DynamicContext, type Evaluator } from '@/runtime/dynamic-context';
import { FunctionItem } from '@/runtime/function-items';
import { type FunctionMaker, MAX_ARITY, namedFunction } from '@/runtime/named-functions';
import { after } from '@/runtime/pausing';
import { ANY_SEQUENCE, type FunctionSignature } from '@/static/matchers';
import { resolveFunctionName, resolvePlainName } from '@/static/name-resolution';
import { expandedKey } from '@/static/static-context';
import { compileSequenceType } from '@/static/type-resolution';
import { printName } from '@/static/type-text';
import type { InlineFunction, NamedFunctionReference, UnresolvedName } from '@/syntax/syntax-tree';
import { bindVariable } from './compile-bindings.ts';
import { compile, type CompileState, staticError } from './compiler.ts';

/** Raises XPST0017 for a name and arity that no function has. */
export function unknownFunction(name: UnresolvedName, arity: number, state: CompileState): never {
  const context = state.context;
  const resolved = resolveFunctionName(name, context);
  const explanation = context.functions.explainMissing(resolved.namespaceURI, resolved.localName);
  const message = `There is no function ${printName(name)}#${arity}`;
  return staticError(
    state,
    XPathErrorCode.UNKNOWN_FUNCTION,
    explanation === undefined ? message : `${message}: ${explanation}`,
    name
  );
}

/** What makes the item of the function a name and arity give, resolved when compiling; XPST0017 for none. */
export function compileFunctionMaker(name: UnresolvedName, arity: number, state: CompileState): FunctionMaker {
  const context = state.context;
  const resolved = resolveFunctionName(name, context);
  const make = namedFunction(resolved.namespaceURI, resolved.localName, arity, context);
  return make ?? unknownFunction(name, arity, state);
}

/** Compiles `name#arity`: the named function as an item, run in the dynamic context of the reference; FOAR0002 for an arity no call can have. */
export function compileNamedFunctionReference(reference: NamedFunctionReference, state: CompileState): Evaluator {
  const { arity, name } = reference;
  if (arity > MAX_ARITY)
    return staticError(state, XPathErrorCode.ARITY_OVERFLOW, `A function cannot take ${arity} arguments`, reference);
  const make = compileFunctionMaker(name, arity, state);
  return (context) => [make(context)];
}

/** Raises XQST0039 when two parameters of an inline function have one name. */
function checkParameterNames(inline: InlineFunction, state: CompileState): void {
  const seen = new Set<string>();
  for (const parameter of inline.parameters) {
    const key = expandedKey(resolvePlainName(parameter.name, state.context));
    if (seen.has(key))
      staticError(
        state,
        XPathErrorCode.DUPLICATE_PARAMETER,
        `The parameter $${parameter.name.localName} is declared twice`,
        parameter
      );
    seen.add(key);
  }
}

/**
 * Compiles `function($a as T) as R { body }`: an anonymous function item that closes over the
 * variables in scope where it is made. Each call runs the body without a focus, its parameters
 * bound in a copy of those variables, and converts the result to the declared type.
 */
export function compileInlineFunction(inline: InlineFunction, state: CompileState): Evaluator {
  checkParameterNames(inline, state);
  const typeOf = (type: InlineFunction['returnType']) =>
    type === undefined ? ANY_SEQUENCE : compileSequenceType(type, state.context);
  const signature: FunctionSignature = {
    parameterTypes: inline.parameters.map((parameter) => typeOf(parameter.type)),
    returnType: typeOf(inline.returnType),
  };
  const outer = state.scope;
  const slots = inline.parameters.map((parameter) => bindVariable(parameter.name, state));
  const body = compile(inline.body, state);
  state.scope = outer;
  const returnType = signature.returnType;
  const declaresResult = inline.returnType !== undefined;
  const convert = (result: XdmValue) =>
    convertArgument(result, returnType, () => 'The result of the anonymous function');
  return (context) => {
    const captured = context.variables.slice();
    const environment = context.environment;
    const item = new FunctionItem(undefined, signature, (args) => {
      const variables = captured.slice();
      for (let index = 0; index < slots.length; index++) variables[slots[index] as number] = args[index] as XdmValue;
      const result = body(new DynamicContext(undefined, 0, 0, variables, environment));
      return declaresResult ? after(result, convert) : result;
    });
    return [item];
  };
}
