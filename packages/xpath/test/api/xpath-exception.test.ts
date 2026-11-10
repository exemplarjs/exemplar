import { describe, expect, it } from 'vitest';
import { xpathError } from '@/api/xpath-exception';
import { XPathErrorCode, XPathCompiler, XPathException } from '@/index';

describe('XPathException', () => {
  it('carries its code, its description and, when it has one, the span of text where it was found', () => {
    const error = new XPathException(XPathErrorCode.SYNTAX_ERROR, 'Bad', { start: 4, end: 5 }, 'a\nbcd');
    expect(error).toMatchObject({
      name: 'XPathException',
      code: 'XPST0003',
      description: 'Bad',
      offset: { start: 4, end: 5 },
      position: { line: 2, column: 3 },
    });
    expect(error.message).toBe('XPST0003: Bad at line 2, column 3');
  });

  it('keeps only the start and end of the span it is given', () => {
    const token = { start: 1, end: 3, text: 'bc' };
    expect(new XPathException(XPathErrorCode.SYNTAX_ERROR, 'Bad', token, 'abcd').offset).toEqual({ start: 1, end: 3 });
  });

  it('leaves the position out when it was not found in the text', () => {
    const error = new XPathException(XPathErrorCode.TYPE_MISMATCH, 'Bad');
    expect(error).toMatchObject({
      description: 'Bad',
      offset: undefined,
      position: undefined,
      message: 'XPTY0004: Bad',
    });
  });

  it('is thrown without a stack trace by xpathError', () => {
    let caught: unknown;
    try {
      xpathError(XPathErrorCode.SYNTAX_ERROR, 'Bad', { start: 0, end: 1 }, 'x');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(XPathException);
    // No stack frames, in V8's format or WebKit's, which leaves no stack at all.
    expect(/\n\s+at |@/.test((caught as Error).stack ?? '')).toBe(false);
  });
});

/** What a compile error of an expression says: its code and description, the text its span covers, and where that starts. */
function compileErrorOf(text: string): Record<string, unknown> | undefined {
  try {
    new XPathCompiler({ namespaces: { app: 'urn:app' } }).compile(text);
  } catch (error) {
    const { code, description, offset, position } = error as XPathException;
    return { code, description, found: offset && text.slice(offset.start, offset.end), offset, position };
  }
  return undefined;
}

describe('XPathException for errors in multi-line expressions', () => {
  it('points at a variable used outside the scope that bound it', () => {
    const text = `let $orders := //order[@status = 'open'],
    $totals := for $o in $orders
               return sum($o/line/(@qty * @price))
return
  if (count($orders) gt 0)
  then avg($totals) div $o
  else 0`;
    expect(compileErrorOf(text)).toEqual({
      code: 'XPST0008',
      description: 'The variable $o is not declared',
      found: '$o',
      offset: { start: 184, end: 186 },
      position: { line: 6, column: 25 },
    });
  });

  it('points at the name of a function called with an arity it lacks, counting an arrow operand as an argument', () => {
    const arrow = `map {
  'open': count(//order[@status = 'open']),
  'late': count(//order[xs:date(@due) lt current-date()]),
  'value': sum(//order/@total) => round-half-even(2, 3)
}`;
    expect(compileErrorOf(arrow)).toEqual({
      code: 'XPST0017',
      description: 'There is no function round-half-even#3',
      found: 'round-half-even',
      offset: { start: 143, end: 158 },
      position: { line: 4, column: 35 },
    });
    const nested = `for $customer in //customer
return
  string-join((
    $customer/name,
    substring($customer/@since)
  ), ' | ')`;
    expect(compileErrorOf(nested)).toMatchObject({
      description: 'There is no function substring#1',
      found: 'substring',
      position: { line: 5, column: 5 },
    });
    const prefixed = `//title
  => string-join(', ')
  => app:shout()`;
    expect(compileErrorOf(prefixed)).toMatchObject({
      description: 'There is no function app:shout#1',
      found: 'app:shout',
      position: { line: 3, column: 6 },
    });
    const reference = `let $fs := (
  upper-case#1,
  lower-case#2
)
return $fs`;
    expect(compileErrorOf(reference)).toMatchObject({
      code: 'XPST0017',
      found: 'lower-case',
      position: { line: 3, column: 3 },
    });
  });

  it('points at the whole name in a type that cannot be resolved', () => {
    const prefix = `let $parse := function($s as xs:string) as xs:integer {
    xs:integer(normalize-space($s))
  },
  $ids := //item/@id ! $parse(.)
return $ids[. instance of fx:integer]`;
    expect(compileErrorOf(prefix)).toEqual({
      code: 'XPST0081',
      description: 'The prefix "fx" is not bound to a namespace',
      found: 'fx:integer',
      offset: { start: 156, end: 166 },
      position: { line: 5, column: 27 },
    });
    const cast = `//payment[
  @amount castable as xs:decimal and
  xs:decimal(@amount) cast as xs:money gt 100
]`;
    expect(compileErrorOf(cast)).toMatchObject({
      code: 'XPST0051',
      description: 'money is not a known atomic type',
      found: 'xs:money',
      position: { line: 3, column: 31 },
    });
    const quantified = `every $v in (1, 2.5, 'x')
satisfies
  $v instance of xs:numbr`;
    expect(compileErrorOf(quantified)).toMatchObject({
      code: 'XPST0051',
      found: 'xs:numbr',
      position: { line: 3, column: 18 },
    });
    const reserved = `//a
  /Q{http://www.w3.org/2000/xmlns/}b`;
    expect(compileErrorOf(reserved)).toMatchObject({
      code: 'XQST0070',
      found: 'Q{http://www.w3.org/2000/xmlns/}b',
      position: { line: 2, column: 4 },
    });
  });

  it('spans what is never closed from where it opens to the end of the text', () => {
    const string = `concat(
  'first line,
   still the string,
  //missing`;
    expect(compileErrorOf(string)).toEqual({
      code: 'XPST0003',
      description: 'A string is not closed',
      found: "'first line,\n   still the string,\n  //missing",
      offset: { start: 10, end: 55 },
      position: { line: 2, column: 3 },
    });
    const comment = `count(//item) (: count them all
  (: nested :) and the end is never
  written`;
    expect(compileErrorOf(comment)).toMatchObject({
      description: 'A comment is not closed with ":)"',
      found: '(: count them all\n  (: nested :) and the end is never\n  written',
      position: { line: 1, column: 15 },
    });
  });

  it('gives an empty span at the end of the text when the expression stops too soon', () => {
    const text = `if (//item)
then
  'some'`;
    expect(compileErrorOf(text)).toEqual({
      code: 'XPST0003',
      description: 'Expected "else", but found the end of the expression',
      found: '',
      offset: { start: 25, end: 25 },
      position: { line: 3, column: 9 },
    });
  });

  it('counts CR LF, CR and LF each as one line end, and a tab as one column', () => {
    expect(compileErrorOf('for $a in (1, 2, 3)\r\nreturn\r\n  $a * $b')).toMatchObject({
      found: '$b',
      offset: { start: 36, end: 38 },
      position: { line: 3, column: 8 },
    });
    expect(compileErrorOf('for $a in (1, 2, 3)\rreturn\r  $a +')).toMatchObject({
      found: '',
      position: { line: 3, column: 7 },
    });
    // The line end inside the comment counts too.
    expect(compileErrorOf('let $x := 1 (: one\n:)\n\t, $y := 2\n\treturn $x +* $y')).toMatchObject({
      description: 'Expected an operator or the end of the expression, but found "$"',
      found: '$',
      position: { line: 4, column: 15 },
    });
  });

  it('counts columns in characters, a character beyond the BMP as one, while the span counts code units', () => {
    const text = `let $label := 'a'
return
  '\u{1F600}' || $ghost`;
    expect(compileErrorOf(text)).toEqual({
      code: 'XPST0008',
      description: 'The variable $ghost is not declared',
      found: '$ghost',
      offset: { start: 35, end: 41 },
      position: { line: 3, column: 10 },
    });
  });

  it('points at the token where the grammar goes wrong', () => {
    const axis = `//section
  /descendant::para
  /sideways::note`;
    expect(compileErrorOf(axis)).toMatchObject({
      description: 'Expected an axis name, but found "sideways"',
      found: 'sideways',
      position: { line: 3, column: 4 },
    });
    expect(compileErrorOf('(1, 2,\n 3))\n')).toMatchObject({
      found: ')',
      offset: { start: 10, end: 11 },
      position: { line: 2, column: 4 },
    });
    const reserved = `let $n := 5
return
  item(1)`;
    expect(compileErrorOf(reserved)).toMatchObject({
      description: '"item" cannot name a function without a prefix',
      found: 'item',
      position: { line: 3, column: 3 },
    });
    const number = `let $n := 10
return $n
  + 3div 2`;
    expect(compileErrorOf(number)).toMatchObject({
      description: 'A number must be followed by a space or a symbol',
      found: 'd',
      position: { line: 3, column: 6 },
    });
  });

  it('spans the whole of a parameter declared twice', () => {
    const text = `let $f := function(
    $a as xs:integer,
    $a as xs:integer
  ) { $a }
return $f(1, 2)`;
    expect(compileErrorOf(text)).toEqual({
      code: 'XQST0039',
      description: 'The parameter $a is declared twice',
      found: '$a as xs:integer',
      offset: { start: 46, end: 62 },
      position: { line: 3, column: 5 },
    });
  });
});
