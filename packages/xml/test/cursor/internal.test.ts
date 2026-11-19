import { describe, expect, it } from 'vitest';
import {
  ADD_FILTER,
  ANCESTOR_XML_ATTRIBUTES,
  copyString,
  CREATE_READER,
  DTD_COMPLETE,
  DTD_ITEMS,
  EVENT_OFFSET,
  EVENT_POSITION,
  HAS_FILTERS,
  INCLUDED_DECLARATIONS,
  isIndex,
  LISTEN_ENTITIES,
  NAMESPACES_IN_SCOPE,
  outOfRange,
  READER_OPTIONS,
} from '@/cursor/internal';

describe('copyString', () => {
  it('returns an equal string, whatever its length', () => {
    expect(copyString('')).toBe('');
    expect(copyString('x')).toBe('x');
    const sliced = `${'a'.repeat(100)}${'b'.repeat(100)}`.slice(50, 150);
    expect(copyString(sliced)).toBe(sliced);
    expect(copyString(sliced.slice(48, 52))).toBe('aabb');
  });
});

describe('indexes', () => {
  it('takes an integer from 0 that fits in 32 bits as an index', () => {
    expect([0, 1, 2 ** 32 - 1].map((n) => isIndex(n))).toEqual([true, true, true]);
    expect([-1, 0.5, 2 ** 32, Number.NaN].map((n) => isIndex(n))).toEqual([false, false, false, false]);
  });

  it('throws a RangeError naming what the index is out of range for', () => {
    expect(() => outOfRange('Attribute', 3)).toThrow(
      new RangeError('Attribute index 3 is out of range for the current event')
    );
  });
});

describe('the cursor hooks', () => {
  it('are distinct symbols', () => {
    const hooks = [
      ADD_FILTER,
      ANCESTOR_XML_ATTRIBUTES,
      CREATE_READER,
      DTD_COMPLETE,
      DTD_ITEMS,
      EVENT_OFFSET,
      EVENT_POSITION,
      HAS_FILTERS,
      INCLUDED_DECLARATIONS,
      LISTEN_ENTITIES,
      NAMESPACES_IN_SCOPE,
      READER_OPTIONS,
    ];
    for (const hook of hooks) expect(typeof hook).toBe('symbol');
    expect(new Set(hooks).size).toBe(hooks.length);
  });
});
