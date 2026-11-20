import {
  type ComparisonOptions,
  EMPTY_SEQUENCE,
  XdmAtomicValue,
  type XdmItem,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import type { Collation } from '@/functions/collations/collation';
import { COLLATIONS } from '@/functions/collations/resolve-collation';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineWithLast } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';

export { booleanResult } from '@/runtime/boolean-value';

/** A string as a value. */
export function stringResult(text: string): XdmValue {
  return [XdmAtomicValue.string(text)];
}

/** An integer as a value. */
export function integerResult(value: bigint | number): XdmValue {
  return [XdmAtomicValue.integer(value)];
}

/** A URI as a value of type `xs:anyURI`. */
export function anyURIResult(uri: string): XdmValue {
  return [new XdmAtomicValue(XS.anyURI, uri)];
}

/** A double as a value. */
export function doubleResult(value: number): XdmValue {
  return [XdmAtomicValue.double(value)];
}

/** The one atomic value of an argument converted to an optional atomic type, or undefined when it is empty. */
export function optionalAtomic(value: XdmValue | undefined): XdmAtomicValue | undefined {
  return value?.[0] as XdmAtomicValue | undefined;
}

/** A function of one optional atomic argument: the empty sequence when it is empty, else what the operation gives. */
export function propagatingEmpty(
  operation: (value: XdmAtomicValue) => XdmValue
): (args: readonly XdmValue[]) => XdmValue {
  return ([arg]) => {
    const value = optionalAtomic(arg);
    return value === undefined ? EMPTY_SEQUENCE : operation(value);
  };
}

/** The string of an argument of type `xs:string?`: `''` when it is empty. */
export function stringArgument(value: XdmValue | undefined): string {
  return optionalString(value) ?? '';
}

/** The text of an argument of type `xs:string?`, or undefined when it is empty. */
export function optionalString(value: XdmValue | undefined): string | undefined {
  return optionalAtomic(value)?.value as string | undefined;
}

/** The one item of an argument of a type with exactly one item, as the kind of item the type gives. */
export function onlyItem<Item extends XdmItem = XdmItem>(value: XdmValue | undefined): Item {
  return (value as XdmValue)[0] as Item;
}

/** The number of an argument of a numeric type with exactly one item, such as `xs:integer`. */
export function numberArgument(value: XdmValue | undefined): number {
  return Number(onlyItem<XdmAtomicValue>(value).value);
}

/** Whether a value converted to `xs:boolean` is true. */
export function isTrue(value: XdmValue): boolean {
  return onlyItem<XdmAtomicValue>(value).value === true;
}

/** Whether a string holds characters beyond the BMP, which take two UTF-16 units each. */
function hasSupplementary(text: string): boolean {
  return /[\uD800-\uDFFF]/.test(text);
}

/** How many characters, each a code point, a string has. */
export function characterCount(text: string): number {
  return hasSupplementary(text) ? Array.from(text).length : text.length;
}

/** A string's characters, each a code point. */
export function characters(text: string): string[] {
  return hasSupplementary(text) ? Array.from(text) : text.split('');
}

/** What a function with a collation does: its arguments without the collation, the dynamic context, and the collation. */
type CollatedImplementation = (args: readonly XdmValue[], context: DynamicContext, collation: Collation) => XdmValue;

/**
 * A function defined twice: by its signature, with the default collation, and with a `$collation`
 * argument after the others, which names the collation it uses.
 */
export function defineWithCollation(signature: string, implementation: CollatedImplementation): FunctionDefinition[] {
  return defineWithLast(signature, '$collation as xs:string', (args, uri, context) =>
    implementation(args, context, collationOf(optionalString(uri), context))
  );
}

/** The collation a URI names, resolved against the static base URI; the default collation when there is no URI. */
export function collationOf(uri: string | undefined, context: DynamicContext): Collation {
  const staticContext = context.environment.staticContext;
  if (uri === undefined) return staticContext.defaultCollation;
  return staticContext.compilerState.get(COLLATIONS).resolve(uri, staticContext.baseURI);
}

/** The comparison options of a context, with strings compared by a collation. */
export function comparisonWith(context: DynamicContext, collation: Collation): ComparisonOptions {
  return { implicitTimezone: context.environment.implicitTimezone, compareStrings: collation.compare };
}

/**
 * The items `substring` and `subsequence` keep: from a start rounded to the nearest whole number,
 * counted from 1, for a rounded length, or to the end when there is no length; none for NaN.
 */
export function roundedSlice<T>(
  items: readonly T[],
  startValue: XdmValue | undefined,
  lengthValue: XdmValue | undefined
): T[] {
  const first = Math.round(numberArgument(startValue));
  const length = lengthValue === undefined ? undefined : numberArgument(lengthValue);
  const end = length === undefined ? Infinity : first + Math.round(length);
  if (Number.isNaN(first) || Number.isNaN(end)) return [];
  const from = Math.max(first, 1) - 1;
  return end <= from + 1 ? [] : items.slice(from, end - 1);
}
