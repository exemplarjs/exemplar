import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { byCodePoint } from '@exemplarjs/xml/internal';
import {
  type AtomicType,
  castAs,
  compareAtomic,
  Decimal,
  isCastable,
  numericArithmetic,
  XdmAtomicValue,
  XS,
} from '@/index';

// The release run scales the number of runs up.
const SCALE = Number(globalThis.process?.env['EXEMPLAR_FUZZ_SCALE'] ?? 1);
const RUNS = { numRuns: 500 * SCALE };

/** Decimals as digits and a scale, from tiny fractions to numbers beyond 2^64. */
const digits = fc.bigInt({ min: -(10n ** 25n), max: 10n ** 25n });
const scale = fc.integer({ min: 0, max: 20 });
const decimal = fc.tuple(digits, scale).map(([value, places]) => Decimal.of(value, places));

/** A decimal as a fraction over a power of ten at a given scale, for exact reference arithmetic. */
function atScale(value: Decimal, places: number): bigint {
  return value.digits * 10n ** BigInt(places - value.scale);
}

test.prop([decimal, decimal], RUNS)('adds, subtracts and multiplies decimals exactly', (a, b) => {
  const places = Math.max(a.scale, b.scale);
  expect(atScale(a.add(b), places)).toBe(atScale(a, places) + atScale(b, places));
  expect(atScale(a.subtract(b), places)).toBe(atScale(a, places) - atScale(b, places));
  const product: bigint = a.digits * b.digits;
  expect(atScale(a.multiply(b), a.scale + b.scale)).toBe(product);
});

test.prop([decimal, decimal.filter((value) => !value.isZero())], RUNS)(
  'divides decimals to within half a unit of the 18th place, and integer-divides and takes remainders consistently',
  (a, b) => {
    const quotient = a.divide(b);
    // |a - q×b| ≤ |b| × 0.5 × 10^-18, checked exactly at a common scale.
    const places = Math.max(a.scale, quotient.scale + b.scale, 18 + b.scale + 1);
    const error = atScale(a, places) - atScale(quotient.multiply(b), places);
    const bound = ((b.digits < 0n ? -b.digits : b.digits) * 10n ** BigInt(places - b.scale - 18)) / 2n;
    expect(error < 0n ? -error : error).toBeLessThanOrEqual(bound);
    const remainder = a.modulo(b);
    expect(Decimal.of(a.integerDivide(b)).multiply(b).add(remainder).compare(a)).toBe(0);
    expect(remainder.isZero() || remainder.sign() === a.sign()).toBe(true);
  }
);

test.prop([fc.bigInt(), fc.bigInt()], RUNS)('keeps integer arithmetic exact at any size', (a, b) => {
  const integer = (value: bigint): XdmAtomicValue => XdmAtomicValue.integer(value);
  expect(numericArithmetic('+', integer(a), integer(b)).value).toBe(a + b);
  expect(numericArithmetic('*', integer(a), integer(b)).value).toBe(a * b);
  if (b !== 0n) expect(numericArithmetic('idiv', integer(a), integer(b)).value).toBe(a / b);
});

/** Values of the primitive types, with the type each is cast back to from its text. */
const values: fc.Arbitrary<XdmAtomicValue> = fc.oneof(
  fc.bigInt().map((value) => XdmAtomicValue.integer(value)),
  decimal.map((value) => XdmAtomicValue.decimal(value)),
  fc.double().map((value) => XdmAtomicValue.double(value)),
  fc.float().map((value) => XdmAtomicValue.float(value)),
  fc.boolean().map((value) => XdmAtomicValue.boolean(value)),
  fc.uint8Array().map((bytes) => new XdmAtomicValue(XS.hexBinary, bytes)),
  fc.uint8Array().map((bytes) => new XdmAtomicValue(XS.base64Binary, bytes))
);

test.prop([values], RUNS)('reads every value back from its canonical text', (value) => {
  const back = castAs(XdmAtomicValue.string(value.stringValue), value.type);
  expect(back.stringValue).toBe(value.stringValue);
  if (typeof value.value === 'number') expect(Object.is(back.value, value.value)).toBe(true);
});

/** The integer types with bounds. */
const BOUNDED: readonly AtomicType[] = [
  XS.byte,
  XS.short,
  XS.int,
  XS.long,
  XS.unsignedByte,
  XS.unsignedLong,
  XS.positiveInteger,
  XS.negativeInteger,
];

test.prop([fc.bigInt({ min: -(2n ** 66n), max: 2n ** 66n }), fc.constantFrom(...BOUNDED)], RUNS)(
  'casts an integer to a sized type exactly when it lies within the type’s range',
  (value, type) => {
    // Each type in the chain may bound the value, so all their bounds apply.
    let inRange = true;
    for (let current: AtomicType | null = type; current !== null; current = current.base) {
      const { minimum, maximum } = current.restriction;
      if ((minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) inRange = false;
    }
    expect(isCastable(XdmAtomicValue.integer(value), type)).toBe(inRange);
  }
);

test.prop([fc.string({ unit: 'binary' }), fc.string({ unit: 'binary' })], RUNS)(
  'orders strings as their arrays of code points',
  (a, b) => {
    const codePoints = (text: string): number[] => Array.from(text, (character) => character.codePointAt(0) as number);
    const left = codePoints(a);
    const right = codePoints(b);
    let expected = 0;
    for (let i = 0; i < Math.min(left.length, right.length) && expected === 0; i++) {
      expected = Math.sign((left[i] as number) - (right[i] as number));
    }
    if (expected === 0) expected = Math.sign(left.length - right.length);
    expect(byCodePoint(a, b)).toBe(expected);
  }
);

/** A finite double as an exact fraction: a bigint numerator over a power of two. */
function exactFraction(value: number): [bigint, bigint] {
  let numerator = value;
  let denominator = 1n;
  while (!Number.isInteger(numerator)) {
    numerator *= 2;
    denominator *= 2n;
  }
  return [BigInt(numerator), denominator];
}

/** The floats either side of a float, by stepping its bit pattern. */
function neighbours(value: number): [number, number] {
  const float = new Float32Array([value]);
  const bits = new Int32Array(float.buffer);
  const step = (delta: number): number => {
    const copy = new Int32Array([bits[0] as number]);
    copy[0] = (copy[0] as number) + delta;
    return new Float32Array(copy.buffer)[0] as number;
  };
  return value > 0 ? [step(-1), step(1)] : [step(1), step(-1)];
}

/** Whether a float is a nearest float to a positive fraction, with ties going to the even significand. */
function isNearestFloat(numerator: bigint, denominator: bigint, float: number): boolean {
  // |n/d - f| compared exactly by cross-multiplying with each candidate's fraction.
  const distance = (candidate: number): [bigint, bigint] => {
    const [top, bottom] = exactFraction(candidate);
    const difference = numerator * bottom - top * denominator;
    return [difference < 0n ? -difference : difference, denominator * bottom];
  };
  const [ownTop, ownBottom] = distance(float);
  return neighbours(float).every((neighbour) => {
    const [top, bottom] = distance(neighbour);
    const order = ownTop * bottom - top * ownBottom;
    if (order !== 0n) return order < 0n;
    // A tie: the float with the even significand wins.
    return (new Int32Array(new Float32Array([float]).buffer)[0] as number) % 2 === 0;
  });
}

const positiveBigInt = fc.bigInt({ min: 1n, max: 2n ** 100n });

test.prop([positiveBigInt, positiveBigInt], RUNS)(
  'rounds a fraction to the nearest float, ties to even',
  (numerator, denominator) => {
    const decimalValue = XdmAtomicValue.decimal(Decimal.of(numerator));
    const asFloat = castAs(decimalValue, XS.float).value as number;
    expect(isNearestFloat(numerator, 1n, asFloat)).toBe(true);
    // Fractions too, through the division a decimal would hold exactly: n / 2^k.
    const shift = denominator % 64n;
    const fractional = XdmAtomicValue.decimal(Decimal.of(numerator * 5n ** shift, Number(shift)));
    expect(isNearestFloat(numerator, 2n ** shift, castAs(fractional, XS.float).value as number)).toBe(true);
  }
);

/** Numbers of every kind, for checking that mixing kinds promotes as casting would. */
const anyNumber: fc.Arbitrary<XdmAtomicValue> = fc.oneof(
  fc.bigInt({ min: -(2n ** 80n), max: 2n ** 80n }).map((value) => XdmAtomicValue.integer(value)),
  decimal.map((value) => XdmAtomicValue.decimal(value)),
  fc.float({ noNaN: true }).map((value) => XdmAtomicValue.float(value)),
  fc.double({ noNaN: true }).map((value) => XdmAtomicValue.double(value))
);

test.prop([anyNumber, anyNumber, fc.constantFrom('+', '-', '*', 'div', 'mod' as const)], RUNS)(
  'computes and compares mixed kinds exactly as after casting both to the wider kind',
  (a, b, operator) => {
    const wider = [XS.integer, XS.decimal, XS.float, XS.double].findLast(
      (type) => type === a.type || type === b.type
    ) as AtomicType;
    const promote = (value: XdmAtomicValue): XdmAtomicValue => (wider === XS.integer ? value : castAs(value, wider));
    const outcome = (run: () => XdmAtomicValue): string => {
      try {
        return run().toString();
      } catch (error) {
        return (error as { code: string }).code;
      }
    };
    expect(outcome(() => numericArithmetic(operator, a, b))).toBe(
      outcome(() => numericArithmetic(operator, promote(a), promote(b)))
    );
    expect(compareAtomic(a, b, true)).toBe(compareAtomic(promote(a), promote(b), true));
  }
);

/** Decimals of high precision, whose products and quotients pass the 100-digit limit. */
const preciseDecimal = fc
  .tuple(fc.bigInt({ min: -(10n ** 80n), max: 10n ** 80n }), fc.integer({ min: 0, max: 90 }))
  .map(([value, places]) => Decimal.of(value, places));

/** How many significant digits a decimal holds. */
function significantDigits(value: Decimal): number {
  return (value.digits < 0n ? -value.digits : value.digits).toString().length;
}

test.prop([decimal, decimal.filter((value) => !value.isZero())], RUNS)(
  'divides to 18 significant digits: the quotient times the divisor is within half a unit of the 18th digit',
  (a, b) => {
    const product = a.divide(b).multiply(b);
    const error = product.subtract(a);
    // |q×b − a| × 2 × 10^17 ≤ |q×b|, as both sides are exact decimals.
    const scaledError = error.multiply(Decimal.of(2n * 10n ** 17n));
    const absolute = (value: Decimal): Decimal => (value.sign() < 0 ? value.negate() : value);
    expect(absolute(scaledError).compare(absolute(product)) <= 0).toBe(true);
  }
);

test.prop([preciseDecimal, preciseDecimal], RUNS)(
  'keeps results to 100 significant digits, rounding only after the point',
  (a, b) => {
    for (const result of [a.add(b), a.subtract(b), a.multiply(b)]) {
      const integerDigits = significantDigits(result) - result.scale;
      expect(significantDigits(result) <= Math.max(100, integerDigits)).toBe(true);
    }
    // The rounded product is within half a unit of its last kept place.
    const product = a.multiply(b);
    const exactDigits = a.digits * b.digits;
    const exactScale = a.scale + b.scale;
    const difference = exactDigits - product.digits * 10n ** BigInt(exactScale - product.scale);
    const halfUnit = 10n ** BigInt(exactScale - product.scale) / 2n;
    expect((difference < 0n ? -difference : difference) <= halfUnit).toBe(true);
  }
);
