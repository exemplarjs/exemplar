import { Occurrence, type XdmValue, XS, XS_NAMESPACE } from '@exemplarjs/xdm';
import { QName } from '@exemplarjs/xml';
import type { FunctionDefinition } from '@/functions/function-library';
import { sequenceTypeOf } from '@/functions/signatures';
import { atomicItemType, type FunctionSignature, sequenceMatcher, type SequenceTypeMatcher } from '@/static/matchers';
import { DEFAULT_NAMESPACES, type StaticContext } from '@/static/static-context';
import { castOptions, type CastTarget, constructorCast, constructorTarget } from './casts.ts';
import type { DynamicContext } from './dynamic-context.ts';
import { FunctionItem } from './function-items.ts';

/** The prefixes the standard namespaces are written with, by namespace, for the names of function items. */
const PREFIXES: ReadonlyMap<string, string> = new Map(
  Object.entries(DEFAULT_NAMESPACES).map(([prefix, namespaceURI]) => [namespaceURI, prefix])
);

/** A function's name as a QName, with the prefix its namespace, one of the standard ones, is written with. */
function functionName(namespaceURI: string, localName: string): QName {
  return new QName(namespaceURI, localName, PREFIXES.get(namespaceURI));
}

/** A function's signature when called with some number of arguments: a repeating last parameter repeated. */
export function definitionSignature(definition: FunctionDefinition, arity: number): FunctionSignature {
  const types = definition.parameterTypes;
  const returnType = definition.returnType;
  if (arity === types.length) return { parameterTypes: types, returnType };
  const last = types.length - 1;
  const parameterTypes: SequenceTypeMatcher[] = [];
  for (let index = 0; index < arity; index++) parameterTypes.push(types[Math.min(index, last)] as SequenceTypeMatcher);
  return { parameterTypes, returnType };
}

/** The parameter of every constructor function: `xs:anyAtomicType?`. */
const CONSTRUCTOR_PARAMETER = sequenceMatcher(atomicItemType(XS.anyAtomicType), Occurrence.ZERO_OR_ONE);

/** The signature of a constructor function: `function(xs:anyAtomicType?) as xs:T?`, or a list type's items `*`. */
function constructorSignature(localName: string, target: CastTarget): FunctionSignature {
  const isList = typeof target === 'object' && 'listOf' in target;
  const returnType = isList ? `${target.listOf.toString()}*` : `xs:${localName}?`;
  return { parameterTypes: [CONSTRUCTOR_PARAMETER], returnType: sequenceTypeOf(returnType) };
}

/** A constructor function as an item, such as `xs:integer#1`, casting with the static context's namespaces; undefined for none. */
function constructorItem(localName: string, context: StaticContext): FunctionItem | undefined {
  const target = constructorTarget(localName);
  if (target === undefined) return undefined;
  const cast = constructorCast(target, castOptions(context));
  return new FunctionItem(functionName(XS_NAMESPACE, localName), constructorSignature(localName, target), ([value]) =>
    cast(value as XdmValue)
  );
}

/**
 * What makes a function of the library as an item, such as `fn:abs#1`, run in the dynamic context
 * it is referred to in. Every item made shares one implementation, so the state the function
 * keeps where it is called from lasts as long as the reference does.
 */
function definitionItemMaker(definition: FunctionDefinition, arity: number): FunctionMaker {
  const name = functionName(definition.namespaceURI, definition.localName);
  const signature = definitionSignature(definition, arity);
  const implementation = definition.implementationForCall();
  return (context) => new FunctionItem(name, signature, (args) => implementation(args, context));
}

/** The most arguments a function item can take, 2^20, as its signature lists a type for each. */
export const MAX_ARITY = 1_048_576;

/** What makes a named function's item in a dynamic context. */
export type FunctionMaker = (context: DynamicContext) => FunctionItem;

/**
 * What makes the function item a name and arity give: a constructor function, the same in every
 * context, or a function of the static context's library, run in the context it is made in;
 * undefined when there is none, or when the arity is beyond `MAX_ARITY`.
 */
export function namedFunction(
  namespaceURI: string,
  localName: string,
  arity: number,
  context: StaticContext
): FunctionMaker | undefined {
  if (arity > MAX_ARITY) return undefined;
  if (namespaceURI === XS_NAMESPACE) {
    const item = arity === 1 ? constructorItem(localName, context) : undefined;
    return item === undefined ? undefined : () => item;
  }
  const definition = context.functions.find(namespaceURI, localName, arity);
  return definition === undefined ? undefined : definitionItemMaker(definition, arity);
}
