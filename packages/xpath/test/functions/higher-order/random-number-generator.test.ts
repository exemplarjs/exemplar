import { describe, expect, it } from 'vitest';
import { evaluate, strings } from '../../helpers/evaluate.ts';

describe('random-number-generator', () => {
  it('gives a map of a number, a next function and a permute function', () => {
    expect(strings('sort(map:keys(random-number-generator(1)))')).toEqual(['next', 'number', 'permute']);
    expect(strings('random-number-generator(1)?number instance of xs:double')).toEqual(['true']);
  });

  it('gives numbers from 0 up to but not including 1', () => {
    const numbers = strings(
      'fold-left(1 to 200, random-number-generator("seed"), function($g, $i) { $g?next() })?number, ' +
        'for $s in 1 to 200 return random-number-generator($s)?number'
    ).map(Number);
    expect(numbers.every((number) => number >= 0 && number < 1)).toBe(true);
  });

  it('gives the same numbers for the same seed', () => {
    expect(
      strings(
        'let $a := random-number-generator(42), $b := random-number-generator(42) ' +
          'return ($a?number = $b?number, $a?next()?next()?number = $b?next()?next()?number)'
      )
    ).toEqual(['true', 'true']);
  });

  it('gives different numbers for different seeds', () => {
    expect(strings('random-number-generator(1)?number = random-number-generator(2)?number')).toEqual(['false']);
    expect(strings('random-number-generator("a")?number = random-number-generator("b")?number')).toEqual(['false']);
  });

  it('gives a new generator from next', () => {
    expect(strings('let $g := random-number-generator(7) return $g?number = $g?next()?number')).toEqual(['false']);
    expect(strings('let $g := random-number-generator(7) return $g?next()?number = $g?next()?number')).toEqual([
      'true',
    ]);
  });

  it('permutes items, the same way for the same seed', () => {
    expect(
      strings(
        'let $p := random-number-generator(3)?permute(1 to 20) return (count($p), deep-equal(sort($p), 1 to 20), deep-equal($p, 1 to 20))'
      )
    ).toEqual(['20', 'true', 'false']);
    expect(
      strings('deep-equal(random-number-generator(3)?permute(1 to 20), random-number-generator(3)?permute(1 to 20))')
    ).toEqual(['true']);
    expect(evaluate('random-number-generator(3)?permute(())')).toEqual([]);
    expect(strings('random-number-generator(3)?permute("only")')).toEqual(['only']);
  });

  it('works with no seed or an empty seed, the same within one evaluation', () => {
    expect(strings('random-number-generator()?number lt 1, random-number-generator(())?number ge 0')).toEqual([
      'true',
      'true',
    ]);
    expect(strings('random-number-generator()?number = random-number-generator()?number')).toEqual(['true']);
  });
});
