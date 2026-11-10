import { describe, expect, it } from 'vitest';
import { stringsBothWays } from '../helpers/resources.ts';

describe('compile', () => {
  it('keeps the operands an expression waited for while the same expression runs again inside it', async () => {
    // The fallback calls the function again, so the inner concat runs while the outer one is reading its operands.
    const recursive = String.raw`
      let $f := function($self, $n) {
        concat(
          parse-json('"\u0000"', map { "fallback": function($s) { if ($n = 0) then "" else $self($self, $n - 1) } }),
          doc("u:" || "b.xml")
        )
      }
      return $f($f, 1)`;
    expect(await stringsBothWays(recursive)).toEqual([['33'], ['33']]);
  });
});
