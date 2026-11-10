import type { XdmItem, XdmValue } from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { StaticContext } from '@/static/static-context';
import type { ResourcePool } from './resources.ts';

/** What stays the same for one evaluation of an expression: its static context, the clock, the implicit timezone and the resources read. */
export interface Environment {
  /** The static context the expression was compiled in, for its base URI and for `function-lookup`. */
  readonly staticContext: StaticContext;
  /** The current date and time, fixed for the evaluation. */
  readonly currentDateTime: Date;
  /** The implicit timezone, in minutes east of UTC. */
  readonly implicitTimezone: number;
  /** Compares strings by the default collation; undefined when that compares by code points. */
  readonly compareStrings: ((a: string, b: string) => number) | undefined;
  /** The documents, text and collections read, and the resolvers they are read through. */
  readonly resources: ResourcePool;
}

/**
 * The dynamic context an expression runs in: the focus (the context item, its position and the
 * size of the sequence it came from), the values of variables by slot, and the environment.
 *
 * @example
 * const context = new DynamicContext(document, 1, 1, [], environment);
 * context.withFocus(child, 2, 5).position; // 2
 */
export class DynamicContext {
  /** The context item, or undefined when there is none. */
  readonly item: XdmItem | undefined;
  /** The context position, read only when there is a context item. */
  readonly position: number;
  /** The context size, read only when there is a context item. */
  readonly size: number;
  /** Variable values by slot; bindings write their slots as they run. */
  readonly variables: XdmValue[];
  readonly environment: Environment;

  constructor(
    item: XdmItem | undefined,
    position: number,
    size: number,
    variables: XdmValue[],
    environment: Environment
  ) {
    this.item = item;
    this.position = position;
    this.size = size;
    this.variables = variables;
    this.environment = environment;
  }

  /** The same context with another focus. */
  withFocus(item: XdmItem, position: number, size: number): DynamicContext {
    return new DynamicContext(item, position, size, this.variables, this.environment);
  }

  /** The same context with the item at an index of a value as the focus. */
  focusOn(items: XdmValue, index: number): DynamicContext {
    return this.withFocus(items[index] as XdmItem, index + 1, items.length);
  }

  /** The context item; raises XPDY0002 when there is none. */
  contextItem(): XdmItem {
    return this.item ?? dynamicError(XPathErrorCode.NO_CONTEXT_ITEM, 'There is no context item');
  }
}

/** A compiled expression: a function from the dynamic context to the value it evaluates to. */
export type Evaluator = (context: DynamicContext) => XdmValue;
