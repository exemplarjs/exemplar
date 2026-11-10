import { Decimal, type RoundingMode } from '@exemplarjs/xdm';

export type { RoundingMode } from '@exemplarjs/xdm';

/** An integer rounded to a number of places, which only a negative number changes. */
export function roundInteger(value: bigint, places: number, mode: RoundingMode): bigint {
  if (places >= 0) return value;
  return Decimal.of(value).round(places, mode).truncate();
}

/** A double rounded through its shortest decimal form; NaN, the infinities and zeros stay as they are. */
export function roundDouble(value: number, places: number, mode: RoundingMode): number {
  if (!Number.isFinite(value) || value === 0) return value;
  if (places === 0 && mode === 'half-up') return Math.round(value);
  if (places === 0 && mode === 'ceiling') return Math.ceil(value);
  if (places === 0 && mode === 'floor') return Math.floor(value);
  const rounded = Decimal.fromNumber(value).round(places, mode).toNumber();
  // A result of zero keeps the sign of the value it came from.
  if (rounded === 0 && value < 0) return -0;
  return rounded;
}
