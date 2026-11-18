/** The bytes of a UTF-16 code unit. */
const UNIT_BYTES = 2;

/** UTF-8 bytes of a string. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** UTF-16 bytes of a string in one byte order, after a byte-order mark unless `bom` is false. */
export function utf16(text: string, littleEndian: boolean, bom = true): Uint8Array {
  const units = bom ? `\uFEFF${text}` : text;
  const out = new Uint8Array(units.length * UNIT_BYTES);
  const view = new DataView(out.buffer);
  // eslint-disable-next-line prefer-code-point -- UTF-16 is written in code units
  for (let i = 0; i < units.length; i++) view.setUint16(i * UNIT_BYTES, units.charCodeAt(i), littleEndian);
  return out;
}

/** Bytes in chunks of one size. */
export function* chunks(bytes: Uint8Array, size: number): Generator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}

/** A web stream giving bytes in chunks of one size. */
export function streamOf(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  const parts = chunks(bytes, size);
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const part = parts.next();
      if (part.done === true) controller.close();
      else controller.enqueue(part.value.slice());
    },
  });
}
