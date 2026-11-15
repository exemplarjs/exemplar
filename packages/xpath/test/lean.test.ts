import { describe, expect, it } from 'vitest';
import { higherOrderFunctions } from '@/groups/higher-order';
import { regexFunctions } from '@/groups/regex';
import { XPathException } from '@/index';
import * as lean from '@/lean';
import { XPathCompiler } from '@/lean';

/** The error compiling an expression raises. */
function compileError(compiler: XPathCompiler, expression: string): XPathException {
  try {
    compiler.compile(expression);
  } catch (error) {
    return error as XPathException;
  }
  throw new Error('nothing was raised');
}

describe('the lean XPathCompiler', () => {
  it('exports what the full entry exports', () => {
    expect(Object.keys(lean).toSorted()).toEqual([
      'InvalidArgumentError',
      'PromiseNotAwaitedError',
      'XPathCompiler',
      'XPathErrorCode',
      'XPathException',
      'XPathExecutable',
      'collectionMap',
    ]);
  });

  it('has the core functions and the groups it is given', () => {
    const compiler = new XPathCompiler({ functions: [regexFunctions, regexFunctions] });
    expect(compiler.compile('count((1, 2)), compare("a", "b"), matches("abc", "^a")').evaluateStrings()).toEqual([
      '2',
      '-1',
      'true',
    ]);
    expect(new XPathCompiler().compile('string-length("abc")').evaluateNumber()).toBe(3);
  });

  it('raises XPST0017 for a function in a group it lacks, naming the group to add', () => {
    const error = compileError(new XPathCompiler(), 'format-number(1, "0")');
    expect(error.code).toBe('XPST0017');
    expect(error.message).toContain(
      'it is in the formatting group; add formattingFunctions from @exemplarjs/xpath/groups/formatting'
    );
    expect(compileError(new XPathCompiler(), 'map:size(map {})').message).toContain('the maps group');
    expect(compileError(new XPathCompiler(), 'no-such-function()').message).not.toContain('group');
  });

  it('loads the groups an expression calls or names before compiling it asynchronously, each once', async () => {
    const compiler = new XPathCompiler();
    const executable = await compiler.compileAsync(
      'format-integer(12, "w"), "a" => matches("a"), array:size#1([1]), map:size(map {}), $d => year-from-date()',
      { variables: { d: 'xs:date' } }
    );
    expect(executable.evaluateStrings(null, { variables: { d: '2020-01-01' } })).toEqual([
      'twelve',
      'true',
      '1',
      '0',
      '2020',
    ]);
    expect(compiler.compile('format-integer(1, "w")').evaluateString()).toBe('one');
    const again = await compiler.compileAsync('replace("a", "a", "b")');
    expect(again.evaluateString()).toBe('b');
  });

  it('leaves alone names in no group, and raises the static errors compile raises', async () => {
    const compiler = new XPathCompiler();
    const always = await compiler.compileAsync('true()');
    expect(always.evaluateBoolean()).toBe(true);
    await expect(compiler.compileAsync('unknown()')).rejects.toThrow(expect.objectContaining({ code: 'XPST0017' }));
    await expect(compiler.compileAsync('1 +')).rejects.toThrow(expect.objectContaining({ code: 'XPST0003' }));
  });

  it('finds through function-lookup only the functions of groups it has', () => {
    const compiler = new XPathCompiler({ functions: [higherOrderFunctions] });
    const lookup = compiler.compile(
      'empty(function-lookup(xs:QName("fn:matches"), 2)), exists(function-lookup(xs:QName("fn:count"), 1))'
    );
    expect(lookup.evaluateStrings()).toEqual(['true', 'true']);
  });
});
