import { describe, expect, it } from 'vitest';
import { UNICODE_BLOCKS } from '@/util/unicode-blocks';

/** How many code points a block's range is a multiple of (Blocks.txt). */
const COLUMN = 0x10;

describe('UNICODE_BLOCKS', () => {
  const blocks = Object.entries(UNICODE_BLOCKS);

  it('lists the blocks in order, without overlaps, each a whole number of columns', () => {
    let previousLast = -1;
    for (const [, [first, last]] of blocks) {
      expect(first).toBeGreaterThan(previousLast);
      expect([first % COLUMN, (last + 1) % COLUMN]).toEqual([0, 0]);
      previousLast = last;
    }
    expect(previousLast).toBe(0x10_ff_ff);
  });

  it('names the blocks without spaces', () => {
    expect(UNICODE_BLOCKS['BasicLatin']).toEqual([0x0, 0x7f]);
    expect(UNICODE_BLOCKS['Latin-1Supplement']).toEqual([0x80, 0xff]);
    expect(UNICODE_BLOCKS['GreekandCoptic']).toEqual([0x3_70, 0x3_ff]);
    expect(blocks.every(([name]) => /^[A-Za-z0-9-]+$/.test(name))).toBe(true);
  });
});
