/** A double's IEEE 754 layout: the bits of its stored fraction, their mask, and the mask of its exponent field once shifted down. */
const FRACTION_BITS = 52n;
const FRACTION_MASK = (1n << FRACTION_BITS) - 1n;
const EXPONENT_MASK = 0x7_ffn;
/** The exponent bias plus the fraction bits: a significand times 2^(exponent - 1075) is the value. */
const EXPONENT_OFFSET = 1075;

/** One reusable view for reading a double's bits. */
const DOUBLE_BITS = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));

/** A finite double's magnitude as a significand and a power of two: the value is significand × 2^exponent. */
export function doubleParts(value: number): [significand: bigint, exponent: number] {
  DOUBLE_BITS.setFloat64(0, value);
  const bits = DOUBLE_BITS.getBigUint64(0);
  const storedExponent = Number((bits >> FRACTION_BITS) & EXPONENT_MASK);
  const stored = bits & FRACTION_MASK;
  // Normal doubles have an implicit leading one; subnormals do not, and share the smallest exponent.
  const significand = storedExponent === 0 ? stored : stored | (1n << FRACTION_BITS);
  return [significand, Math.max(storedExponent, 1) - EXPONENT_OFFSET];
}
