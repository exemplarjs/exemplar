import type { QName } from '@exemplarjs/xml';

/**
 * A function item: a value that can be called, as XPath 3.1 adds to the data model. Maps and
 * arrays are function items too, each of one argument, so this is their base class as well as
 * that of the functions a processor makes from inline functions and function references.
 *
 * ```ts
 * const map = XdmMap.of([[XdmAtomicValue.string('a'), [XdmAtomicValue.integer(1n)]]]);
 * map instanceof XdmFunction; // true
 * map.arity; // 1
 * ```
 *
 * The class holds only what every function item has; how one is called belongs to the language
 * that made it.
 */
export abstract class XdmFunction {
  /** The function's name, or undefined for an anonymous function, a map or an array. */
  abstract readonly name: QName | undefined;
  /** How many arguments the function takes. */
  abstract readonly arity: number;
}
