import { describe, expect, it } from 'vitest';
import { XdmAtomicValue } from '@exemplarjs/xdm';
import { XPathCompiler, XPathException } from '@/index';

/** The code of the error compiling an expression raises. */
function compileError(compile: () => unknown): string | undefined {
  try {
    compile();
    return undefined;
  } catch (error) {
    return (error as XPathException).code;
  }
}

describe('XPathCompiler', () => {
  it('knows the standard prefixes and the ones it is given', () => {
    const compiler = new XPathCompiler({ namespaces: { p: 'urn:p' } });
    expect(compiler.compile('namespace-uri-from-QName(xs:QName("p:a")), math:pi() > 3').evaluateStrings()).toEqual([
      'urn:p',
      'true',
    ]);
  });

  it('reports static errors when compiling, with their position', () => {
    const compiler = new XPathCompiler();
    expect(compileError(() => compiler.compile('1 +'))).toBe('XPST0003');
    expect(compileError(() => compiler.compile('$x'))).toBe('XPST0008');
    expect(compileError(() => compiler.compile('q:a'))).toBe('XPST0081');
    expect(compileError(() => compiler.compile('Q{http://www.w3.org/2000/xmlns/}a'))).toBe('XQST0070');
    expect(compileError(() => compiler.compile('schema-element(q:a)'))).toBe('XPST0081');
    expect(compileError(() => compiler.compile('schema-element(a)'))).toBe('XPST0008');
    expect(compileError(() => compiler.compile('. instance of element(a, xs:nonsense)'))).toBe('XPST0008');
  });

  it('declares variables by name, or by name and type, prefixes and all', () => {
    const compiler = new XPathCompiler({ namespaces: { p: 'urn:p' } });
    expect(compiler.compile('$a', { variables: ['a'] }).evaluate(null, { variables: { a: 'x' } })).toEqual([
      XdmAtomicValue.string('x'),
    ]);
    expect(compiler.compile('$p:a', { variables: ['p:a'] }).evaluateString(null, { variables: { 'p:a': 'x' } })).toBe(
      'x'
    );
    expect(
      compiler.compile('$a', { variables: { a: 'xs:string?' } }).evaluate(null, { variables: { a: undefined } })
    ).toEqual([]);
    expect(compileError(() => compiler.compile('1', { variables: ['a b'] }))).toBe('XPST0003');
    expect(compileError(() => compiler.compile('1', { variables: ['q:a'] }))).toBe('XPST0081');
    expect(compileError(() => compiler.compile('1', { variables: { a: 'xs:string xs:string' } }))).toBe('XPST0003');
    expect(compileError(() => compiler.compile('1', { variables: { a: 'xs:nonsense' } }))).toBe('XPST0051');
  });

  it('types the values of declared variables', () => {
    const compiler = new XPathCompiler();
    const typed = compiler.compile('$min', {
      variables: { min: 'xs:integer', names: 'xs:string*', node: 'element()?' },
    });
    expect(typed.evaluate(null, { variables: { min: 1, names: ['a'], node: null } })).toHaveLength(1);
    // Calls that must not compile, checked by the type checker and never run.
    const wrongType = (): unknown =>
      // @ts-expect-error -- min is an integer, not a string
      typed.evaluate(null, { variables: { min: 'a', names: [], node: null } });
    const missing = (): unknown =>
      // @ts-expect-error -- every declared variable needs a value
      typed.evaluate(null, { variables: { min: 1 } });
    const untyped = compiler.compile('1');
    const extra = (): unknown =>
      // @ts-expect-error -- an expression without variables takes none
      untyped.evaluate(null, { variables: { x: 1 } });
    expect([wrongType, missing, extra].every((call) => typeof call === 'function')).toBe(true);
  });

  it('compares and sorts strings by its default collation where an expression names none', () => {
    const primary = 'http://www.w3.org/2013/collation/UCA?strength=primary';
    const insensitive = new XPathCompiler({ defaultCollation: primary });
    const compared = insensitive.compile("$a = 'A', compare($a, 'A'), index-of(('b', 'A'), $a), default-collation()", {
      variables: ['a'],
    });
    expect(compared.evaluateStrings(null, { variables: { a: 'a' } })).toEqual(['true', '0', '2', primary]);
    expect(insensitive.compile("'a' = 'A'").evaluateBoolean()).toBe(true);
    expect(new XPathCompiler().compile("'a' = 'A'").evaluateBoolean()).toBe(false);
    expect(() => new XPathCompiler({ defaultCollation: 'urn:none' })).toThrow(
      'The collation urn:none is not supported'
    );
  });

  it('keeps the executables it makes, unless it is told to compile afresh each time', () => {
    const compiler = new XPathCompiler({ cache: false });
    expect(compiler.compile('1 + 1')).not.toBe(compiler.compile('1 + 1'));
    const keeping = new XPathCompiler();
    const sum = keeping.compile('1 + $n', { variables: ['n'] });
    expect(keeping.compile('1 + $n', { variables: ['n'] })).toBe(sum);
    expect(sum.evaluateNumber(null, { variables: { n: 2 } })).toBe(3);
    // The same text with other variables, or with their types, is another expression.
    expect(keeping.compile('1 + $n', { variables: { n: 'xs:integer' } })).not.toBe(sum);
    expect(keeping.compile('1 + $n', { variables: ['m', 'n'] })).not.toBe(sum);
    // A variable declared with no type, as untyped callers can, is still a variable declared.
    const untyped = { n: undefined } as unknown as Record<string, string>;
    expect(keeping.compile('1', { variables: untyped })).not.toBe(keeping.compile('1', { variables: {} }));
    expect(new XPathCompiler().compile('1 + $n', { variables: ['n'] })).not.toBe(sum);
  });

  it('keeps no expression that does not compile, and past its capacity of 256 drops the one used longest ago', () => {
    const keeping = new XPathCompiler();
    expect(compileError(() => keeping.compile('1 +'))).toBe('XPST0003');
    expect(compileError(() => keeping.compile('1 +'))).toBe('XPST0003');
    const first = keeping.compile('0');
    const second = keeping.compile('1');
    for (let number = 2; number < 256; number++) keeping.compile(String(number));
    expect(keeping.compile('0')).toBe(first);
    keeping.compile('256');
    expect(keeping.compile('0')).toBe(first);
    expect(keeping.compile('1')).not.toBe(second);
  });

  it('applies its default element namespace and base URI', () => {
    const compiler = new XPathCompiler({ defaultElementNamespace: 'urn:d', baseURI: 'http://e.com/' });
    expect(compiler.compile('namespace-uri-from-QName(xs:QName("a")), static-base-uri()').evaluateStrings()).toEqual([
      'urn:d',
      'http://e.com/',
    ]);
  });

  it('raises XQST0070 for any name in the xmlns namespace, however it gets there', () => {
    const xmlns = 'http://www.w3.org/2000/xmlns/';
    expect(compileError(() => new XPathCompiler({ namespaces: { x: xmlns } }).compile('x:a'))).toBe('XQST0070');
    expect(compileError(() => new XPathCompiler({ defaultElementNamespace: xmlns }).compile('a'))).toBe('XQST0070');
  });

  it('gives the span of the text a static error was found in, and its description apart', () => {
    const compiler = new XPathCompiler();
    const thrown = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        const { code, description, offset } = error as XPathException;
        return { code, description, offset };
      }
      return undefined;
    };
    expect(thrown(() => compiler.compile('count($chep)'))).toEqual({
      code: 'XPST0008',
      description: 'The variable $chep is not declared',
      offset: { start: 6, end: 11 },
    });
    expect(thrown(() => compiler.compile('1 + q:a'))?.offset).toEqual({ start: 4, end: 7 });
    expect(thrown(() => compiler.compile('1', { variables: ['a b'] }))?.offset).toEqual({ start: 0, end: 3 });
    expect(thrown(() => compiler.compile('1', { variables: { a: 'xs:string xs:string' } }))?.offset).toEqual({
      start: 10,
      end: 19,
    });
  });

  it('reports positions in characters, counting one beyond the BMP as one', () => {
    let column: number | undefined;
    try {
      new XPathCompiler().compile('"\u{10000}\u{10000}" +');
    } catch (error) {
      column = (error as XPathException).position?.column;
    }
    expect(column).toBe(7);
  });
});
