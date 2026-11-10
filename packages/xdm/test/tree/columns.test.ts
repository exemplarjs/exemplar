import { describe, expect, it } from 'vitest';
import { Columns } from '@/tree/columns';

describe('Columns', () => {
  it('makes Int32 and Uint8 columns of one length', () => {
    const columns = new Columns(10, 2, 1);
    expect(columns.capacity).toBe(10);
    expect([columns.int32At(0).length, columns.int32At(1).length, columns.uint8At(0).length]).toEqual([10, 10, 10]);
    columns.int32At(0)[9] = -1;
    columns.uint8At(0)[0] = 255;
    expect(columns.int32At(1)[0]).toBe(0);
    expect(columns.int32At(0)[9]).toBe(-1);
  });

  it('copies the first entries of other columns', () => {
    const small = new Columns(4, 1, 1);
    small.int32At(0).set([1, 2, 3, 4]);
    small.uint8At(0).set([5, 6, 7, 8]);
    const larger = new Columns(8, 1, 1, small, 3);
    expect([...larger.int32At(0)]).toEqual([1, 2, 3, 0, 0, 0, 0, 0]);
    expect([...larger.uint8At(0)]).toEqual([5, 6, 7, 0, 0, 0, 0, 0]);
  });

  it('keeps small columns in shared buffers, which trimming leaves as they are', () => {
    const a = new Columns(16, 1, 0);
    const b = new Columns(16, 1, 0);
    expect(a.int32At(0).buffer).toBe(b.int32At(0).buffer);
    expect(a.trimmed(1)).toBe(a);
  });

  it('gives large columns a buffer of their own, trimmed when more than an eighth is unused', () => {
    const columns = new Columns(100_000, 1, 1);
    columns.int32At(0)[1] = 7;
    expect(columns.trimmed(90_000)).toBe(columns);
    const trimmed = columns.trimmed(1000);
    expect(trimmed.capacity).toBe(1000);
    expect(trimmed.int32At(0)[1]).toBe(7);
    expect(trimmed.int32At(0).buffer).not.toBe(columns.int32At(0).buffer);
  });

  it('starts a new shared buffer when one fills', () => {
    const buffers = new Set<ArrayBufferLike>();
    for (let i = 0; i < 40; i++) buffers.add(new Columns(500, 1, 0).int32At(0).buffer);
    expect(buffers.size).toBeGreaterThan(1);
  });
});
