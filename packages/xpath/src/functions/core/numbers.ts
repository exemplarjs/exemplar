import { castAs, type Decimal, EMPTY_SEQUENCE, XdmAtomicValue, type XdmValue, XS } from '@exemplarjs/xdm';
import { absoluteDecimal, NumericKind, numericKind, tryCastAs } from '@exemplarjs/xdm/internal';
import { Radix } from '@exemplarjs/xml/internal';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { atomizeOptional } from '@/runtime/atomization';
import { roundDouble, type RoundingMode, roundInteger } from './rounding.ts';
import { doubleResult, propagatingEmpty, optionalAtomic } from './values.ts';

/** The most places, either side of the point, a rounding function rounds to; more make no difference. */
const MAX_ROUNDING_PLACES = 10_000;

/** A number rounded by a mode to a number of places, keeping its numeric kind. */
function rounded(value: XdmAtomicValue, places: number, mode: RoundingMode): XdmAtomicValue {
  const kind = numericKind(value);
  const content = value.value;
  if (kind === NumericKind.INTEGER) return XdmAtomicValue.integer(roundInteger(content as bigint, places, mode));
  if (kind === NumericKind.DECIMAL) return XdmAtomicValue.decimal((content as Decimal).round(places, mode));
  const result = roundDouble(content as number, places, mode);
  return kind === NumericKind.FLOAT ? XdmAtomicValue.float(Math.fround(result)) : XdmAtomicValue.double(result);
}

/** A function of one optional number that keeps its numeric kind. */
function numericFunction(name: string, operation: (value: XdmAtomicValue) => XdmAtomicValue): FunctionDefinition {
  return defineFunction(
    `fn:${name}($arg as xs:numeric?) as xs:numeric?`,
    propagatingEmpty((value) => [operation(value)])
  );
}

/** `fn:abs`: the value without its sign. */
function absolute(value: XdmAtomicValue): XdmAtomicValue {
  const kind = numericKind(value);
  const content = value.value;
  if (kind === NumericKind.INTEGER)
    return XdmAtomicValue.integer((content as bigint) < 0n ? -(content as bigint) : (content as bigint));
  if (kind === NumericKind.DECIMAL) return XdmAtomicValue.decimal(absoluteDecimal(content as Decimal));
  return kind === NumericKind.FLOAT
    ? XdmAtomicValue.float(Math.abs(content as number))
    : XdmAtomicValue.double(Math.abs(content as number));
}

/** A rounding function, with and without its number of places. */
function roundingFunctions(name: string, mode: RoundingMode): FunctionDefinition[] {
  return [
    numericFunction(name, (value) => rounded(value, 0, mode)),
    defineFunction(`fn:${name}($arg as xs:numeric?, $precision as xs:integer) as xs:numeric?`, ([arg, precision]) => {
      const value = optionalAtomic(arg);
      if (value === undefined) return EMPTY_SEQUENCE;
      const places = Number(optionalAtomic(precision)?.value);
      return [rounded(value, Math.max(Math.min(places, MAX_ROUNDING_PLACES), -MAX_ROUNDING_PLACES), mode)];
    }),
  ];
}

/** `fn:number`: a value as a double, NaN when it is empty or does not cast. */
export function numberOf(value: XdmAtomicValue | undefined): number {
  if (value === undefined) return Number.NaN;
  const double = tryCastAs(value, XS.double);
  return double === undefined ? Number.NaN : (double.value as number);
}

/** A value atomized to at most one item, then as `fn:number` gives it; XPTY0004 for more than one item. */
function numberOfValue(value: XdmValue, what: string): number {
  return numberOf(atomizeOptional(value, what));
}

/** A math function of one optional double. */
function mathFunction(name: string, operation: (value: number) => number): FunctionDefinition {
  return defineFunction(
    `math:${name}($arg as xs:double?) as xs:double?`,
    propagatingEmpty((value) => doubleResult(operation(value.value as number)))
  );
}

/** `math:pow`, with IEEE 754's answers where JavaScript's differ: 1 to any power, even NaN, and -1 to an infinite power are 1. */
function power(base: number, exponent: number): number {
  if (base === 1 || (base === -1 && !Number.isFinite(exponent) && !Number.isNaN(exponent))) return 1;
  return base ** exponent;
}

/** The functions on numbers (F&O §4.4 and §4.5) and the math functions (§4.8). */
export const NUMBER_FUNCTIONS: readonly FunctionDefinition[] = [
  numericFunction('abs', absolute),
  numericFunction('ceiling', (value) => rounded(value, 0, 'ceiling')),
  numericFunction('floor', (value) => rounded(value, 0, 'floor')),
  ...roundingFunctions('round', 'half-up'),
  ...roundingFunctions('round-half-to-even', 'half-even'),
  defineFunction('fn:number() as xs:double', (_, context) =>
    doubleResult(numberOfValue([context.contextItem()], 'The context item'))
  ),
  defineFunction('fn:number($arg as xs:anyAtomicType?) as xs:double', ([arg]) =>
    doubleResult(numberOf(optionalAtomic(arg)))
  ),
  defineFunction('math:pi() as xs:double', () => doubleResult(Math.PI)),
  mathFunction('exp', Math.exp),
  mathFunction('exp10', (value) => Radix.DECIMAL ** value),
  mathFunction('log', Math.log),
  mathFunction('log10', Math.log10),
  mathFunction('sqrt', Math.sqrt),
  mathFunction('sin', Math.sin),
  mathFunction('cos', Math.cos),
  mathFunction('tan', Math.tan),
  mathFunction('asin', Math.asin),
  mathFunction('acos', Math.acos),
  mathFunction('atan', Math.atan),
  defineFunction('math:pow($x as xs:double?, $y as xs:numeric) as xs:double?', ([x, y]) => {
    const base = optionalAtomic(x);
    if (base === undefined) return EMPTY_SEQUENCE;
    const exponent = castAs(optionalAtomic(y) as XdmAtomicValue, XS.double).value as number;
    return doubleResult(power(base.value as number, exponent));
  }),
  defineFunction('math:atan2($y as xs:double, $x as xs:double) as xs:double', ([y, x]) =>
    doubleResult(Math.atan2(optionalAtomic(y)?.value as number, optionalAtomic(x)?.value as number))
  ),
];
