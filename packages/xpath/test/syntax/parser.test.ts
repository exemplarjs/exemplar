import { describe, expect, it } from 'vitest';
import { parseXPath } from '@/internal';
import { parseErrorOf } from '../helpers/syntax.ts';

describe('parseXPath', () => {
  it('parses a whole expression and nothing after it', () => {
    expect(parseXPath(' 1 (: done :) ')).toMatchObject({ kind: 'literal', start: 1, end: 2 });
    expect(parseErrorOf('1 2')?.message).toBe(
      'XPST0003: Expected an operator or the end of the expression, but found "2" at line 1, column 3'
    );
  });

  it('rejects an empty expression', () => {
    expect(parseErrorOf('')?.message).toBe(
      'XPST0003: Expected an expression, but found the end of the expression at line 1, column 1'
    );
    expect(parseErrorOf(' (: nothing :) ')?.code).toBe('XPST0003');
  });

  it('reports the line and column of an error, counting CR LF as one line end', () => {
    const error = parseErrorOf('1 +\r\n  2 +\n  )');
    expect(error?.position).toEqual({ line: 3, column: 3 });
    expect(error?.offset).toEqual({ start: 13, end: 14 });
  });

  it('gives the span of the token an error was found at, empty at the end of the expression', () => {
    expect(parseErrorOf('if (1) then 2 else')?.offset).toEqual({ start: 18, end: 18 });
    expect(parseErrorOf('(1, 2]')?.offset).toEqual({ start: 5, end: 6 });
    expect(parseErrorOf('(1, 2) return')?.offset).toEqual({ start: 7, end: 13 });
    expect(parseErrorOf('1 + \u{F0000}')?.offset).toEqual({ start: 4, end: 6 });
    expect(parseErrorOf('1 + "abc')?.offset).toEqual({ start: 4, end: 8 });
    expect(parseErrorOf('1 + Q{x}')?.offset).toEqual({ start: 8, end: 8 });
  });
});
