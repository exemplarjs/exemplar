/** The size of the shared buffers small columns are carved from. */
const SLAB_BYTES = 65_536;

/** The most a set of columns may take from a shared buffer, an eighth of it; larger sets get a buffer of their own. */
const MAX_CARVED_SHIFT = 3;
const MAX_CARVED_BYTES = SLAB_BYTES >> MAX_CARVED_SHIFT;

/** Trimming keeps columns that waste at most an eighth of their room. */
const ALLOWED_WASTE_SHIFT = 3;

/** Carved offsets stay a multiple of this, as Int32 columns need. */
const ALIGNMENT = 8;

/** The shared buffer small columns are carved from, and how much of it is taken. */
let slab = new ArrayBuffer(SLAB_BYTES);
let slabUsed = 0;

/** Room for `bytes` bytes: a buffer and an offset in it, carved from the shared buffer when small. */
function room(bytes: number): [ArrayBuffer, number] {
  if (bytes > MAX_CARVED_BYTES) return [new ArrayBuffer(bytes), 0];
  if (slabUsed + bytes > SLAB_BYTES) {
    slab = new ArrayBuffer(SLAB_BYTES);
    slabUsed = 0;
  }
  const offset = slabUsed;
  slabUsed += Math.ceil(bytes / ALIGNMENT) * ALIGNMENT;
  return [slab, offset];
}

/**
 * Int32 and Uint8 arrays of one length carved from one ArrayBuffer, so that a set of columns,
 * such as a tree's node arrays, costs one allocation to make and one to grow. Small sets share
 * buffers, as V8's ArrayBuffers are slow to allocate and to collect.
 */
export class Columns {
  readonly capacity: number;
  readonly int32: readonly Int32Array[];
  readonly uint8: readonly Uint8Array[];
  /** Whether the columns share a buffer with others, which trimming them would not shrink. */
  readonly #carved: boolean;

  /** Columns with room for `capacity` entries each, holding a copy of `from`'s first `length` entries when given. */
  constructor(capacity: number, int32Count: number, uint8Count: number, from?: Columns, length = 0) {
    const int32Bytes = capacity * Int32Array.BYTES_PER_ELEMENT;
    const [buffer, start] = room(int32Count * int32Bytes + uint8Count * capacity);
    const int32: Int32Array[] = [];
    const uint8: Uint8Array[] = [];
    for (let i = 0; i < int32Count; i++) int32.push(new Int32Array(buffer, start + i * int32Bytes, capacity));
    const uint8Start = start + int32Count * int32Bytes;
    for (let i = 0; i < uint8Count; i++) uint8.push(new Uint8Array(buffer, uint8Start + i * capacity, capacity));
    if (from !== undefined) {
      for (let i = 0; i < int32Count; i++) int32[i]?.set(from.int32At(i).subarray(0, length));
      for (let i = 0; i < uint8Count; i++) uint8[i]?.set(from.uint8At(i).subarray(0, length));
    }
    this.capacity = capacity;
    this.int32 = int32;
    this.uint8 = uint8;
    this.#carved = buffer === slab;
  }

  /** The Int32 column at an index. */
  int32At(column: number): Int32Array {
    return this.int32[column] as Int32Array;
  }

  /** The Uint8 column at an index. */
  uint8At(column: number): Uint8Array {
    return this.uint8[column] as Uint8Array;
  }

  /** Columns of `length` entries: these, when carved or wasting at most an eighth of their room, or else a copy. */
  trimmed(length: number): Columns {
    const wasted = this.capacity - length;
    if (this.#carved || wasted <= this.capacity >> ALLOWED_WASTE_SHIFT) return this;
    return this.resized(length, length);
  }

  /** Columns of the same layout with room for `capacity` entries, holding a copy of the first `length`. */
  resized(capacity: number, length: number): Columns {
    return new Columns(capacity, this.int32.length, this.uint8.length, this, length);
  }
}
