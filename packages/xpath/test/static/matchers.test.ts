import { describe, expect, it } from 'vitest';
import { Occurrence, XdmAtomicValue } from '@exemplarjs/xdm';
import { ANY_ITEM, sequenceMatcher } from '@/static/matchers';

describe('sequence matchers', () => {
  it('match any items to item(), testing only their count', () => {
    const one = XdmAtomicValue.string('one');
    expect(ANY_ITEM.matches(one)).toBe(true);
    const exactlyOne = sequenceMatcher(ANY_ITEM, Occurrence.EXACTLY_ONE);
    expect([exactlyOne.matches([one]), exactlyOne.matches([]), exactlyOne.matches([one, one])]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
