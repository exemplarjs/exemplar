import { describe, expect, it } from 'vitest';
import { errorCode, strings } from '../../helpers/evaluate.ts';

/** The result of analyze-string written as its element names, nesting and text. */
const ANALYZED =
  'string-join(analyze-string($input, $pattern)//node() ! (if (self::text()) then "\'" || . || "\'" else local-name(.) || (@nr ! ("#" || .))), " ")';

/** An expression that analyses an input with a pattern and describes the result. */
function described(input: string, pattern: string, flags = ''): string[] {
  const call = flags === '' ? ANALYZED : ANALYZED.replace('$pattern)', `$pattern, "${flags}")`);
  return strings(`let $input := "${input}", $pattern := "${pattern}" return ${call}`);
}

describe('analyze-string', () => {
  it('splits the input into matches and the stretches between them', () => {
    expect(described('banana', 'a')).toEqual([
      "non-match 'b' match 'a' non-match 'n' match 'a' non-match 'n' match 'a'",
    ]);
    expect(described('abc', 'abc')).toEqual(["match 'abc'"]);
    expect(described('', 'a')).toEqual(['']);
  });

  it('nests groups as the pattern nests them, numbered by nr', () => {
    expect(described('2024-02', String.raw`(\d+)-((\d)(\d))`)).toEqual([
      "match group#1 '2024' '-' group#2 group#3 '0' group#4 '2'",
    ]);
  });

  it('keeps an empty group that took part, and leaves out one that did not', () => {
    expect(described('banana', '(b)(x?)')).toEqual(["match group#1 'b' group#2 non-match 'anana'"]);
    expect(described('ac', 'a(b)?c')).toEqual(["match 'ac'"]);
    expect(described('ab', '(a(x)?(b))')).toEqual(["match group#1 'a' group#3 'b'"]);
  });

  it('applies flags, puts the result in the fn namespace, and gives it no parent', () => {
    expect(described('ABC', 'b', 'i')).toEqual(["non-match 'A' match 'B' non-match 'C'"]);
    expect(
      strings('let $r := analyze-string("a", "a") return (namespace-uri($r), name($r), string(empty($r/..)))')
    ).toEqual(['http://www.w3.org/2005/xpath-functions', 'fn:analyze-string-result', 'true']);
  });

  it('raises FORX0003 for a pattern matching the empty string', () => {
    expect(errorCode('analyze-string("a", "x*")')).toBe('FORX0003');
  });
});
