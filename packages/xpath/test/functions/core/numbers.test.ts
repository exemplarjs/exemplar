import { describe, expect, it } from 'vitest';
import { evaluate, LIBRARY } from '../../helpers/evaluate.ts';

describe('numeric functions', () => {
  it('keep the base numeric type of their argument', () => {
    expect(evaluate('abs(-2), abs(xs:short(-2)), abs(-1.5), abs(xs:float(-1)), abs(-1e0), abs(())')).toEqual([
      'xs:integer 2',
      'xs:integer 2',
      'xs:decimal 1.5',
      'xs:float 1',
      'xs:double 1',
    ]);
    expect(evaluate('abs(2), abs(1.5)')).toEqual(['xs:integer 2', 'xs:decimal 1.5']);
  });

  it('round up, down, half up and half to even', () => {
    expect(evaluate('ceiling(1.2), floor(-1.2), ceiling(xs:double(1.2)), floor(xs:float(-1.2))')).toEqual([
      'xs:decimal 2',
      'xs:decimal -2',
      'xs:double 2',
      'xs:float -2',
    ]);
    expect(evaluate('round(2.5), round(-2.5), round(xs:double(-0.4)), round(xs:double("INF")), round(0e0)')).toEqual([
      'xs:decimal 3',
      'xs:decimal -2',
      'xs:double -0',
      'xs:double INF',
      'xs:double 0',
    ]);
    expect(
      evaluate('round-half-to-even(2.5), round-half-to-even(3.5), round-half-to-even(-2.5), round-half-to-even(-3.5)')
    ).toEqual(['xs:decimal 2', 'xs:decimal 4', 'xs:decimal -2', 'xs:decimal -4']);
  });

  it('round to places, negative ones rounding to tens and more', () => {
    expect(evaluate('round(1.256, 2), round(1250, -2), round(-1250, -2), round(12, 1), round(-1.255, 2)')).toEqual([
      'xs:decimal 1.26',
      'xs:integer 1300',
      'xs:integer -1200',
      'xs:integer 12',
      'xs:decimal -1.25',
    ]);
    expect(
      evaluate(
        'round-half-to-even(1.245, 2), round-half-to-even(xs:double(1.235), 2), round(xs:double(-0.04), 1), round((), 1)'
      )
    ).toEqual(['xs:decimal 1.24', 'xs:double 1.24', 'xs:double -0']);
    expect(evaluate('round(xs:double(1.5), 0), ceiling(-0.5), floor(0.5), round-half-to-even(2)')).toEqual([
      'xs:double 2',
      'xs:decimal 0',
      'xs:decimal 0',
      'xs:integer 2',
    ]);
  });

  it('give numbers as doubles, NaN for what is not one', () => {
    expect(evaluate('number("1.5"), number("a"), number(()), number(true())')).toEqual([
      'xs:double 1.5',
      'xs:double NaN',
      'xs:double NaN',
      'xs:double 1',
    ]);
    expect(evaluate('(//price)[1]/number()', LIBRARY)).toEqual(['xs:double 12']);
  });
});

describe('math functions', () => {
  it('compute as IEEE 754 does', () => {
    expect(
      evaluate('math:pi() > 3.14, math:sqrt(4), math:exp(0), math:exp10(2), math:log(1), math:log10(100)')
    ).toEqual(['xs:boolean true', 'xs:double 2', 'xs:double 1', 'xs:double 100', 'xs:double 0', 'xs:double 2']);
    expect(
      evaluate(
        'math:sin(0), math:cos(0), math:tan(0), math:asin(0), math:acos(1), math:atan(0), math:atan2(0, 1), math:sqrt(())'
      )
    ).toEqual([
      'xs:double 0',
      'xs:double 1',
      'xs:double 0',
      'xs:double 0',
      'xs:double 0',
      'xs:double 0',
      'xs:double 0',
    ]);
  });

  it('raise to powers, 1 to any power and -1 to an infinite one being 1', () => {
    expect(
      evaluate(
        'math:pow(2, 3), math:pow(1, xs:double("NaN")), math:pow(-1, xs:double("INF")), math:pow(-1, xs:double("NaN")), math:pow((), 1)'
      )
    ).toEqual(['xs:double 8', 'xs:double 1', 'xs:double 1', 'xs:double NaN']);
  });
});
