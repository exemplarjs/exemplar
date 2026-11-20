import {
  isFunction,
  XdmAtomicValue,
  type XdmFunction,
  type XdmItem,
  type XdmValue,
  XS_NAMESPACE,
} from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { absoluteURI } from '@/functions/core/uri-resolution';
import { convertArgument } from '@/functions/function-conversion';
import { type FunctionDefinition, mayPause } from '@/functions/function-library';
import { constructorTarget } from '@/runtime/casts';
import type { DynamicContext, Evaluator } from '@/runtime/dynamic-context';
import { callFunction, checkArity, convertedArgument, FunctionItem, invoke } from '@/runtime/function-items';
import { countReader, firstItemsReader } from '@/runtime/item-streams';
import { definitionSignature } from '@/runtime/named-functions';
import { pausable, type PausableEvaluator } from '@/runtime/pausing';
import { type SequenceTypeMatcher, signatureOf } from '@/static/matchers';
import { resolveFunctionName } from '@/static/name-resolution';
import type { Argument, DynamicArrow, DynamicCall, Expression, FunctionCall, StaticArrow } from '@/syntax/syntax-tree';
import { compileFunctionMaker, unknownFunction } from './compile-functions.ts';
import { compileConstructorCall } from './compile-types.ts';
import { compile, type CompileState } from './compiler.ts';

/** The arguments of a call, compiled: an evaluator for each expression, undefined for each `?` placeholder. */
type CompiledArguments = readonly (Evaluator | undefined)[];

/** The arguments of a call or arrow, the arrow's operand first. */
function argumentsOf(call: FunctionCall | StaticArrow | DynamicCall | DynamicArrow): readonly Argument[] {
  if (call.kind === 'static-arrow' || call.kind === 'dynamic-arrow') return [call.operand, ...call.arguments];
  return call.arguments;
}

/** Arguments compiled: an evaluator for each expression, undefined for each `?` placeholder. */
function compileArguments(argumentList: readonly Argument[], state: CompileState): CompiledArguments {
  return argumentList.map((argument) =>
    argument.kind === 'argument-placeholder' ? undefined : compile(argument, state)
  );
}

/** Whether compiled arguments have a placeholder, which makes the call a partial application. */
function isPartial(argumentList: CompiledArguments): boolean {
  return argumentList.includes(undefined);
}

/** Notes the resource a call reads when its first argument is a literal URI, for asynchronous evaluation to fetch first. */
function noteResourceURI(first: Argument | undefined, state: CompileState): void {
  if (first?.kind !== 'literal' || typeof first.value.value !== 'string') return;
  const uri = absoluteURI(first.value.value, state.context.baseURI);
  if (uri !== undefined) state.resourceURIs.push(uri);
}

/** Compiles a static call: `f(a, b)`, or `a => f(b)`, which calls `f(a, b)`; a partial application when an argument is `?`. */
export function compileCall(call: FunctionCall | StaticArrow, state: CompileState): Evaluator {
  const { name } = call;
  const context = state.context;
  const resolved = resolveFunctionName(name, context);
  const syntax = argumentsOf(call);
  const [first] = syntax;
  const arity = syntax.length;
  const target = resolved.namespaceURI === XS_NAMESPACE ? constructorTarget(resolved.localName) : undefined;
  if (target !== undefined && arity === 1 && first?.kind !== 'argument-placeholder')
    return compileConstructorCall(target, first as Expression, state);
  const argumentList = compileArguments(syntax, state);
  if (isPartial(argumentList)) {
    const make = compileFunctionMaker(name, arity, state);
    return (context) => partialApplication(make(context), argumentList, context);
  }
  const definition = context.functions.find(resolved.namespaceURI, resolved.localName, arity);
  if (definition === undefined) return unknownFunction(name, arity, state);
  if (definition.readsResource === true) noteResourceURI(first, state);
  return compileStaticCall(definition, argumentList as readonly Evaluator[]);
}

/**
 * A call of a function that reads only the first items of its first argument, or their count, as
 * `exists` and `count` do: the argument read as a stream that far, the function given those items,
 * or the count made without them. Undefined for another function.
 */
function compileLazyCall(
  definition: FunctionDefinition,
  argumentEvaluators: readonly Evaluator[]
): Evaluator | undefined {
  const { lazyFirst } = definition;
  if (lazyFirst === undefined || argumentEvaluators.length !== 1) return undefined;
  // An argument that may pause runs before the call, as its operand, so this one cannot.
  const first = argumentEvaluators[0] as Evaluator;
  if (lazyFirst === 'count') {
    const count = countReader(first);
    return (context) => [XdmAtomicValue.integer(count(context))];
  }
  const items = firstItemsReader(first, lazyFirst);
  const implementation = definition.implementationForCall();
  return (context) => implementation([items(context)], context) as XdmValue;
}

/** Compiles a call of a function of the library, each argument converted to its parameter's type; one that may pause is marked so. */
function compileStaticCall(definition: FunctionDefinition, argumentEvaluators: readonly Evaluator[]): Evaluator {
  const lazy = compileLazyCall(definition, argumentEvaluators);
  if (lazy !== undefined) return lazy;
  const { localName } = definition;
  // This call's own implementation, with any state the function keeps where it is called from.
  const implementation = definition.implementationForCall();
  const types = definitionSignature(definition, argumentEvaluators.length).parameterTypes;
  const descriptions = argumentEvaluators.map((_, index) => () => `Argument ${index + 1} of ${localName}()`);
  const call: PausableEvaluator = (dynamicContext) => {
    const values: XdmValue[] = [];
    for (let index = 0; index < argumentEvaluators.length; index++) {
      const value = (argumentEvaluators[index] as Evaluator)(dynamicContext);
      const type = types[index] as SequenceTypeMatcher;
      values.push(convertArgument(value, type, descriptions[index] as () => string));
    }
    return implementation(values, dynamicContext);
  };
  return mayPause(definition) ? pausable(call) : (call as Evaluator);
}

/** The one function item a dynamic call is made on; XPTY0004 for anything else. */
function functionOperand(value: XdmValue): XdmFunction {
  const item = value[0] as XdmItem;
  if (value.length !== 1 || !isFunction(item))
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, 'A dynamic function call must be made on one function item');
  return item;
}

/** Compiles `$f(a, b)`, or `a => $f(b)`: a call of the function item the expression gives; a partial application when an argument is `?`. */
export function compileDynamicCall(call: DynamicCall | DynamicArrow, state: CompileState): Evaluator {
  const target = compile(call.function, state);
  const argumentList = compileArguments(argumentsOf(call), state);
  if (isPartial(argumentList))
    return (context) => partialApplication(functionOperand(target(context)), argumentList, context);
  const evaluators = argumentList as readonly Evaluator[];
  // Any function item may read a resource, so a dynamic call may always pause.
  return pausable((context) => {
    const item = functionOperand(target(context));
    return callFunction(
      item,
      evaluators.map((argument) => argument(context))
    );
  });
}

/**
 * A partial application (§3.1.5.4): an anonymous function of one parameter for each placeholder,
 * which calls the function with the fixed arguments, evaluated and converted now, and its own in
 * their places. XPTY0004 when the arguments are not as many as the function's arity.
 */
function partialApplication(item: XdmFunction, argumentList: CompiledArguments, context: DynamicContext): XdmValue {
  checkArity(item, argumentList.length);
  const fixed = argumentList.map((argument, index) =>
    argument === undefined ? undefined : convertedArgument(item, argument(context), index)
  );
  const signature = signatureOf(item);
  const parameterTypes = signature.parameterTypes.filter((_, index) => fixed[index] === undefined);
  const partial = new FunctionItem(undefined, { parameterTypes, returnType: signature.returnType }, (args) => {
    let next = 0;
    return invoke(
      item,
      fixed.map((value) => value ?? (args[next++] as XdmValue))
    );
  });
  return [partial];
}
