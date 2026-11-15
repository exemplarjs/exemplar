/** The radixes exemplar reads and writes numbers in. */
export const Radix = { BINARY: 2, DECIMAL: 10, HEXADECIMAL: 16 } as const;

/** A number in upper-case hexadecimal, padded with zeros to at least `digits` digits. */
export function upperHex(value: number, digits: number): string {
  return value.toString(Radix.HEXADECIMAL).toUpperCase().padStart(digits, '0');
}
