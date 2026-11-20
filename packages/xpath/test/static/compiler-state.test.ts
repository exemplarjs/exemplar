import { describe, expect, it } from 'vitest';
import { CompilerState, type CompilerStateKey } from '@/static/compiler-state';

describe('CompilerState', () => {
  it('makes each kind of state once, when it is first asked for', () => {
    let made = 0;
    const COUNTERS: CompilerStateKey<{ count: number }> = { make: () => ({ count: ++made }) };
    const state = new CompilerState();
    expect(made).toBe(0);
    expect(state.get(COUNTERS)).toBe(state.get(COUNTERS));
    expect([made, state.get(COUNTERS).count]).toEqual([1, 1]);
  });

  it('keeps kinds apart, and each compiler its own', () => {
    const NAMES: CompilerStateKey<string[]> = { make: () => [] };
    const OTHERS: CompilerStateKey<string[]> = { make: () => [] };
    const state = new CompilerState();
    expect(state.get(NAMES)).not.toBe(state.get(OTHERS));
    expect(new CompilerState().get(NAMES)).not.toBe(state.get(NAMES));
  });
});
