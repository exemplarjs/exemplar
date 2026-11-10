import { XdmAtomicValue, XdmMap, type XdmValue } from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { DynamicContext } from '@/runtime/dynamic-context';
import type { Pausable } from '@/runtime/pausing';
import { isTrue, onlyItem, stringArgument } from './core/values.ts';
import { convertArgument } from './function-conversion.ts';
import type { FunctionDefinition } from './function-library.ts';
import { defineWithLast, sequenceTypeOf } from './signatures.ts';

/**
 * The value of an option in an options map, converted to the option's sequence type, such as
 * `xs:boolean`, by the function conversion rules, or undefined when the map does not have it;
 * XPTY0004 when it cannot be.
 */
export function optionValue(options: XdmMap, name: string, type: string): XdmValue | undefined {
  const value = options.get(XdmAtomicValue.string(name));
  if (value === undefined) return undefined;
  return convertArgument(value, sequenceTypeOf(type), () => `The option ${name}`);
}

/** A boolean option, or its default when it is not given. */
export function booleanOption(options: XdmMap, name: string, fallback: boolean): boolean {
  const value = optionValue(options, name, 'xs:boolean');
  return value === undefined ? fallback : isTrue(value);
}

/** A string option that must be one of some values, or its default when it is not given; FOJS0005 for another value. */
export function choiceOption<const Choice extends string>(
  options: XdmMap,
  name: string,
  choices: readonly Choice[],
  fallback: Choice
): Choice {
  const value = optionValue(options, name, 'xs:string');
  if (value === undefined) return fallback;
  const text = stringArgument(value);
  if (!(choices as readonly string[]).includes(text))
    return dynamicError(
      XPathErrorCode.INVALID_OPTION,
      `The option ${name} must be one of ${choices.join(', ')}, not "${text}"`
    );
  return text as Choice;
}

/** What a function with options does: its arguments without the options, the options map, and the dynamic context. */
type OptionsImplementation = (
  args: readonly XdmValue[],
  options: XdmMap,
  context: DynamicContext
) => Pausable<XdmValue>;

/** A function defined twice: by its signature, with no options, and with a `$options as map(*)` argument after the others. */
export function defineWithOptions(signature: string, implementation: OptionsImplementation): FunctionDefinition[] {
  return defineWithLast(signature, '$options as map(*)', (args, options, context) =>
    implementation(args, options === undefined ? XdmMap.EMPTY : onlyItem<XdmMap>(options), context)
  );
}
