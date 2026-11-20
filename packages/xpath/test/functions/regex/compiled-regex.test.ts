import { describe, expect, it } from 'vitest';
import { EMPTY_SEQUENCE, XdmAtomicValue, type XdmValue } from '@exemplarjs/xdm';
import { type TranslatedRegex, translateRegex } from '@exemplarjs/xml/internal';
import { defineWithFlags, segments } from '@/functions/regex/compiled-regex';
import type { DynamicContext } from '@/runtime/dynamic-context';

/** Strings as the arguments of a call. */
function strings(...values: string[]): XdmValue[] {
  return values.map((value) => [XdmAtomicValue.string(value)]);
}

/** A dynamic context for functions that read none. */
const NO_CONTEXT = undefined as unknown as DynamicContext;

describe('defineWithFlags', () => {
  it('translates a pattern once at each place the function is called from, for each set of flags', () => {
    const seen: TranslatedRegex[] = [];
    const [withoutFlags, withFlags] = defineWithFlags(
      'fn:seen($input as xs:string?, $pattern as xs:string)',
      'allowed',
      (_strings, regex) => {
        seen.push(regex);
        return EMPTY_SEQUENCE;
      }
    );
    const here = withoutFlags!.implementationForCall();
    const there = withoutFlags!.implementationForCall();
    void here(strings('x', 'a+'), NO_CONTEXT);
    void here(strings('y', 'a+'), NO_CONTEXT);
    void there(strings('x', 'a+'), NO_CONTEXT);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[0]);
    const flagged = withFlags!.implementationForCall();
    void flagged(strings('x', 'a+', 'i'), NO_CONTEXT);
    void flagged(strings('x', 'a+', ''), NO_CONTEXT);
    expect([seen[3]!.regex.test('A'), seen[4]!.regex.test('A')]).toEqual([true, false]);
  });

  it('gives the implementation its strings and flags, and caches no pattern that fails', () => {
    const calls: unknown[] = [];
    const [, withFlags] = defineWithFlags(
      'fn:seen($input as xs:string?, $pattern as xs:string)',
      'refused',
      (given, _regex, flags) => {
        calls.push([...given], flags);
        return EMPTY_SEQUENCE;
      }
    );
    const call = withFlags!.implementationForCall();
    void call(strings('in', 'a', 'q'), NO_CONTEXT);
    expect(calls).toEqual([['in', 'a'], 'q']);
    expect(() => call(strings('in', '^', ''), NO_CONTEXT)).toThrow(/FORX0003/);
    expect(() => call(strings('in', '^', ''), NO_CONTEXT)).toThrow(/FORX0003/);
  });
});

describe('segments', () => {
  it('divides a text into segments, each match with its groups, leaving the shared expressions untouched', () => {
    const translated = translateRegex('(a)(b)?', '', 'xpath');
    const parts = [...segments(translated, 'abxa'), ...segments(translated, 'xx')];
    expect(parts.map(({ from, match }) => [from, match?.index, match?.[0], match?.indices?.[2]])).toEqual([
      [0, 0, 'ab', [1, 2]],
      [2, 3, 'a', undefined],
      [4, undefined, undefined, undefined],
      [0, undefined, undefined, undefined],
    ]);
    expect([translated.regex.lastIndex, translated.global.lastIndex]).toEqual([0, 0]);
  });
});
