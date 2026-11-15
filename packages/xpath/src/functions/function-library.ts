import type { XdmValue } from '@exemplarjs/xdm';
import type { DynamicContext } from '@/runtime/dynamic-context';
import type { Pausable } from '@/runtime/pausing';
import type { SequenceTypeMatcher } from '@/static/matchers';

/** What a function does: its arguments, already converted to its parameter types, and the dynamic context to its result, or a promise of it for one that pauses. */
export type FunctionImplementation = (args: readonly XdmValue[], context: DynamicContext) => Pausable<XdmValue>;

/** A function: its name, its parameter and result types, and what it does. */
export interface FunctionDefinition {
  readonly namespaceURI: string;
  readonly localName: string;
  readonly parameterTypes: readonly SequenceTypeMatcher[];
  readonly returnType: SequenceTypeMatcher;
  /** Whether the last parameter repeats, as `fn:concat`'s does, for any number of arguments from the count of parameters. */
  readonly variadic: boolean;
  readonly implementation: FunctionImplementation;
  /** Whether the first argument is the URI of a resource it reads, which asynchronous evaluation fetches first when it is a literal. */
  readonly readsResource?: boolean;
  /** Whether it may give a promise for a resource it reads by other means; a function that reads by URI or takes a function argument may. */
  readonly pauses?: boolean;
  /** How much of its first argument it needs, when not all: so many first items, as `exists` needs one, or only their count. */
  readonly lazyFirst?: number | 'count';
}

/** Whether a function may give a promise: it reads resources, or calls the function items it is given. */
export function mayPause(definition: FunctionDefinition): boolean {
  return (
    definition.pauses === true ||
    definition.readsResource === true ||
    definition.parameterTypes.some((type) => type.itemType?.shape.kind === 'function')
  );
}

/** A function that reads a resource by the URI that is its first argument, which is fetched first when it is a literal. */
export function reading(definition: FunctionDefinition): FunctionDefinition {
  return { ...definition, readsResource: true };
}

/** A function that may give a promise for a resource it reads by other means. */
export function pausing(definition: FunctionDefinition): FunctionDefinition {
  return { ...definition, pauses: true };
}

/** How many first items tell one item from several: a second shows there are more, as `exactly-one` and effective boolean values ask. */
export const ITEMS_THAT_TELL_SEVERAL = 2;

/** The functions of one name: those of a fixed arity by arity, and the variadic one, if any. */
interface NamedFunctions {
  readonly byArity: (FunctionDefinition | undefined)[];
  variadic: FunctionDefinition | undefined;
}

/**
 * The functions an expression can call, by name and number of arguments.
 *
 * @example
 * const library = new FunctionLibrary().add(...coreFunctions);
 * library.find(FN_NAMESPACE, 'count', 1); // fn:count#1
 */
export class FunctionLibrary {
  /** The functions by namespace, then by local name. */
  readonly #names = new Map<string, Map<string, NamedFunctions>>();
  /** Says where to find a function the library lacks, for the error that names it. */
  readonly explainMissing: (namespaceURI: string, localName: string) => string | undefined;

  constructor(explainMissing: (namespaceURI: string, localName: string) => string | undefined = () => undefined) {
    this.explainMissing = explainMissing;
  }

  /** Adds functions, a later one replacing an earlier one of the same name and arity. */
  add(...definitions: readonly FunctionDefinition[]): this {
    for (const definition of definitions) {
      const { namespaceURI, localName } = definition;
      let inNamespace = this.#names.get(namespaceURI);
      if (inNamespace === undefined) {
        inNamespace = new Map();
        this.#names.set(namespaceURI, inNamespace);
      }
      let named = inNamespace.get(localName);
      if (named === undefined) {
        named = { byArity: [], variadic: undefined };
        inNamespace.set(localName, named);
      }
      if (definition.variadic) named.variadic = definition;
      else named.byArity[definition.parameterTypes.length] = definition;
    }
    return this;
  }

  /** The function with a name and number of arguments, or undefined. */
  find(namespaceURI: string, localName: string, arity: number): FunctionDefinition | undefined {
    const named = this.#names.get(namespaceURI)?.get(localName);
    if (named === undefined) return undefined;
    const variadic = named.variadic;
    const exact = named.byArity[arity];
    if (exact !== undefined) return exact;
    if (variadic !== undefined && arity >= variadic.parameterTypes.length) return variadic;
    return undefined;
  }
}
