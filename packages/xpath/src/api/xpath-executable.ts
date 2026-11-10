import {
  Decimal,
  isArray,
  isAtomicValue,
  isMap,
  isNode,
  XdmError,
  type XdmItem,
  type XdmNode,
  type XdmValue,
} from '@exemplarjs/xdm';
import { timezoneFromOption } from '@exemplarjs/xdm/internal';
import { InvalidArgumentError } from '@exemplarjs/xml';
import { ErrorFactory } from '@exemplarjs/xml/internal';
import { codepointCollation } from '@/functions/collations/collation';
import { numberOf } from '@/functions/core/numbers';
import { stringValueOf } from '@/functions/core/strings';
import { atomizeOptional } from '@/runtime/atomization';
import { effectiveBooleanValue } from '@/runtime/boolean-value';
import { DynamicContext, type Environment, type Evaluator } from '@/runtime/dynamic-context';
import type { Pausable } from '@/runtime/pausing';
import { ResourcePool } from '@/runtime/resources';
import type { StaticContext } from '@/static/static-context';
import { type Converters, itemToJS, wholePartSafe } from './converters.ts';
import type { EvaluationOptions, TemporalSettings } from './evaluation-options.ts';
import { bindValue, type BoundVariable } from './variable-binding.ts';
import type { EvaluationArguments } from './variable-types.ts';
import { dynamicError, XPathErrorCode, XPathException } from './xpath-exception.ts';

/** What an executable is made of, by the compiler. */
export interface ExecutableParts {
  readonly evaluator: Evaluator;
  readonly slotCount: number;
  readonly variables: readonly BoundVariable[];
  readonly staticContext: StaticContext;
  readonly converters: Converters;
  /** The absolute URIs of the resources the expression names as literals, which asynchronous evaluation fetches together first. */
  readonly resourceURIs: readonly string[];
}

/** The variables of a call that gives none. */
const NO_VARIABLES: Readonly<Record<string, unknown>> = {};

/** Whether an evaluation's resource pool waits for resolvers that answer with a promise. */
const WAITS_FOR_RESOURCES = true;
const ANSWERS_AT_ONCE = false;

/** An error of the data model, raised inside an expression, as the XPathException the caller sees. */
function asXPathException(error: unknown): unknown {
  if (!(error instanceof XdmError)) return error;
  return ErrorFactory.create(XPathException, error.code, error.description);
}

/** Raises XPTY0004 for a result of more than one item, which `method` cannot give. */
function checkOneItem(value: XdmValue, method: string): void {
  if (value.length > 1)
    dynamicError(XPathErrorCode.TYPE_MISMATCH, `${method} needs one item; the result has ${value.length}`);
}

/** A result's one item as a string, `''` for an empty result; XPTY0004 for more than one item. */
function stringOf(value: XdmValue): string {
  checkOneItem(value, 'evaluateString');
  return value.length === 0 ? '' : stringValueOf(value[0] as XdmItem);
}

/** A value as `fn:number` gives it; a RangeError for a whole number or decimal beyond what a number holds exactly. */
function safeNumberOf(value: XdmValue, what: string): number {
  const atomic = atomizeOptional(value, what);
  const number = numberOf(atomic);
  const content = atomic?.value;
  if (typeof content === 'bigint' || content instanceof Decimal)
    wholePartSafe(number, content, 'use evaluate() for the exact value');
  return number;
}

/** A result's items, each as a string. */
function stringsOf(value: XdmValue): string[] {
  return value.map((item) => stringValueOf(item));
}

/** A result's one item as `fn:number` gives it, NaN for an empty result; XPTY0004 for more than one item. */
function numberOfResult(value: XdmValue): number {
  checkOneItem(value, 'evaluateNumber');
  return safeNumberOf(value, 'The result');
}

/** A result's items, each as `fn:number` gives it. */
function numbersOf(value: XdmValue): number[] {
  return value.map((item) => safeNumberOf([item], 'The item'));
}

/** What an item that is not a node is, for an error message. */
function describeItem(item: XdmItem): string {
  if (isAtomicValue(item)) return `a value of type ${item.type.toString()}`;
  if (isMap(item)) return 'a map';
  return isArray(item) ? 'an array' : 'a function';
}

/** A result as nodes; XPTY0004 when it holds anything else. */
function nodesOf(value: XdmValue): XdmNode[] {
  const other = value.find((item) => !isNode(item));
  if (other !== undefined) {
    dynamicError(XPathErrorCode.TYPE_MISMATCH, `selectNodes needs nodes; the result holds ${describeItem(other)}`);
  }
  return value as XdmNode[];
}

/**
 * One evaluation's environment. The clock is read when the call starts, but the current date and
 * time and the machine's timezone are made from it only when an expression first asks, as most
 * never do; a timezone given as an option is checked at once.
 */
class EvaluationEnvironment implements Environment {
  readonly staticContext: StaticContext;
  readonly resources: ResourcePool;
  readonly compareStrings: ((a: string, b: string) => number) | undefined;
  readonly #startedAt = Date.now();
  #currentDateTime: Date | undefined;
  #implicitTimezone: number | undefined;

  constructor(staticContext: StaticContext, resources: ResourcePool, temporal: TemporalSettings | undefined) {
    this.staticContext = staticContext;
    this.resources = resources;
    const collation = staticContext.defaultCollation;
    this.compareStrings = collation === codepointCollation ? undefined : collation.compare;
    this.#currentDateTime = temporal?.currentDateTime;
    const zone = temporal?.implicitTimezone;
    this.#implicitTimezone = zone === undefined ? undefined : timezoneFromOption(zone);
  }

  get currentDateTime(): Date {
    this.#currentDateTime ??= new Date(this.#startedAt);
    return this.#currentDateTime;
  }

  get implicitTimezone(): number {
    // getTimezoneOffset counts minutes west of UTC, at the moment the call started; UTC itself is 0, not -0.
    this.#implicitTimezone ??= -new Date(this.#startedAt).getTimezoneOffset() || 0;
    return this.#implicitTimezone;
  }
}

/**
 * A compiled XPath expression, run as often as needed against a context item and the values of its
 * variables.
 *
 * Each way of evaluating has an asynchronous twin, such as `evaluateAsync` for `evaluate`, for
 * resolvers that answer with a promise, such as `fetchResolver`: it pauses where the expression
 * reads a resource still to arrive, and gives the same result. The synchronous methods raise a
 * `TypeError` instead.
 *
 * @example
 * const titles = new XPathCompiler().compile('//book[price > $min]/title', { variables: { min: 'xs:integer' } });
 * titles.evaluateStrings(doc, { variables: { min: 10 } }); // ['Dune', ...]
 * await new XPathCompiler().compile("doc('https://example.org/books.xml')//title").evaluateStringsAsync(null, {
 *   resources: { uriResolver: fetchResolver() },
 * });
 */
export class XPathExecutable<Values = Record<string, never>> {
  readonly #parts: ExecutableParts;
  /** The names of the declared variables. */
  readonly #declared: ReadonlySet<string>;

  constructor(parts: ExecutableParts) {
    this.#parts = parts;
    this.#declared = new Set(parts.variables.map((variable) => variable.name));
  }

  /** Evaluates the expression to its value, exact: an `XdmValue` of nodes and atomic values. */
  evaluate(contextItem?: XdmItem | null, ...[options]: EvaluationArguments<Values>): XdmValue {
    // A pool that does not wait raises a TypeError rather than give a promise, so the value is there at once.
    return this.#evaluate(contextItem, options, ANSWERS_AT_ONCE) as XdmValue;
  }

  /**
   * Evaluates the expression as `evaluate` does, waiting for resolvers that answer with a promise:
   * the resources the expression names as literals are asked for together first, and wherever it
   * reaches one still to arrive, it pauses until it does.
   */
  async evaluateAsync(contextItem?: XdmItem | null, ...[options]: EvaluationArguments<Values>): Promise<XdmValue> {
    try {
      return await this.#evaluate(contextItem, options, WAITS_FOR_RESOURCES);
    } catch (error) {
      throw asXPathException(error);
    }
  }

  /** One evaluation: the variables checked and bound, the dynamic context made, and the expression run. */
  #evaluate(
    contextItem: XdmItem | null | undefined,
    options: (EvaluationOptions & { readonly variables?: unknown }) | undefined,
    waits: boolean
  ): Pausable<XdmValue> {
    const parts = this.#parts;
    const given = (options?.variables ?? NO_VARIABLES) as Readonly<Record<string, unknown>>;
    this.#checkNames(given);
    const resources = new ResourcePool(options?.resources, waits);
    const slots: XdmValue[] = Array.from({ length: parts.slotCount });
    const environment = new EvaluationEnvironment(parts.staticContext, resources, options?.temporal);
    try {
      for (const variable of parts.variables)
        slots[variable.slot] = bindValue(given[variable.name], variable, parts.converters);
      if (waits) resources.prefetch(parts.resourceURIs);
      return parts.evaluator(new DynamicContext(contextItem ?? undefined, 1, 1, slots, environment));
    } catch (error) {
      throw asXPathException(error);
    }
  }

  /** Raises a TypeError for a variable that is not declared. */
  #checkNames(given: Readonly<Record<string, unknown>>): void {
    const declared = this.#declared;
    const extra = Object.keys(given).find((name) => !declared.has(name));
    if (extra !== undefined) throw ErrorFactory.create(InvalidArgumentError, `The variable $${extra} is not declared`);
  }

  /** The result's items, one at a time. */
  select(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): IterableIterator<XdmItem> {
    return this.evaluate(contextItem, ...evaluationArguments)[Symbol.iterator]();
  }

  /** The result as nodes; a TypeError when it holds anything else. */
  selectNodes(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): XdmNode[] {
    return nodesOf(this.evaluate(contextItem, ...evaluationArguments));
  }

  /** `selectNodes`, waiting for resources as `evaluateAsync` does. */
  async selectNodesAsync(
    contextItem?: XdmItem | null,
    ...evaluationArguments: EvaluationArguments<Values>
  ): Promise<XdmNode[]> {
    return nodesOf(await this.evaluateAsync(contextItem, ...evaluationArguments));
  }

  /** The result's one item as a string, `''` for an empty result; XPTY0004 for more than one item. */
  evaluateString(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): string {
    return stringOf(this.evaluate(contextItem, ...evaluationArguments));
  }

  /** `evaluateString`, waiting for resources as `evaluateAsync` does. */
  async evaluateStringAsync(
    contextItem?: XdmItem | null,
    ...evaluationArguments: EvaluationArguments<Values>
  ): Promise<string> {
    return stringOf(await this.evaluateAsync(contextItem, ...evaluationArguments));
  }

  /** Each of the result's items as a string. */
  evaluateStrings(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): string[] {
    return stringsOf(this.evaluate(contextItem, ...evaluationArguments));
  }

  /** `evaluateStrings`, waiting for resources as `evaluateAsync` does. */
  async evaluateStringsAsync(
    contextItem?: XdmItem | null,
    ...evaluationArguments: EvaluationArguments<Values>
  ): Promise<string[]> {
    return stringsOf(await this.evaluateAsync(contextItem, ...evaluationArguments));
  }

  /** The result's one item as `fn:number` gives it, NaN for an empty result; XPTY0004 for more than one item. */
  evaluateNumber(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): number {
    return numberOfResult(this.evaluate(contextItem, ...evaluationArguments));
  }

  /** `evaluateNumber`, waiting for resources as `evaluateAsync` does. */
  async evaluateNumberAsync(
    contextItem?: XdmItem | null,
    ...evaluationArguments: EvaluationArguments<Values>
  ): Promise<number> {
    return numberOfResult(await this.evaluateAsync(contextItem, ...evaluationArguments));
  }

  /** Each of the result's items as `fn:number` gives it. */
  evaluateNumbers(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): number[] {
    return numbersOf(this.evaluate(contextItem, ...evaluationArguments));
  }

  /** `evaluateNumbers`, waiting for resources as `evaluateAsync` does. */
  async evaluateNumbersAsync(
    contextItem?: XdmItem | null,
    ...evaluationArguments: EvaluationArguments<Values>
  ): Promise<number[]> {
    return numbersOf(await this.evaluateAsync(contextItem, ...evaluationArguments));
  }

  /** The result's effective boolean value, as `fn:boolean` gives it. */
  evaluateBoolean(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): boolean {
    return effectiveBooleanValue(this.evaluate(contextItem, ...evaluationArguments));
  }

  /** `evaluateBoolean`, waiting for resources as `evaluateAsync` does. */
  async evaluateBooleanAsync(
    contextItem?: XdmItem | null,
    ...evaluationArguments: EvaluationArguments<Values>
  ): Promise<boolean> {
    return effectiveBooleanValue(await this.evaluateAsync(contextItem, ...evaluationArguments));
  }

  /** The result's items as JavaScript: atomic values by the compiler's converters, maps as `Map`s, arrays as lists, nodes and functions as they are. */
  evaluateJS(contextItem?: XdmItem | null, ...evaluationArguments: EvaluationArguments<Values>): unknown[] {
    return this.#toJS(this.evaluate(contextItem, ...evaluationArguments));
  }

  /** `evaluateJS`, waiting for resources as `evaluateAsync` does. */
  async evaluateJSAsync(
    contextItem?: XdmItem | null,
    ...evaluationArguments: EvaluationArguments<Values>
  ): Promise<unknown[]> {
    return this.#toJS(await this.evaluateAsync(contextItem, ...evaluationArguments));
  }

  /** A result's items as JavaScript, by the compiler's converters. */
  #toJS(value: XdmValue): unknown[] {
    const converters = this.#parts.converters;
    return value.map((item) => itemToJS(item, converters));
  }
}
