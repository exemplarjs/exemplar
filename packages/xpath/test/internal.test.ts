import { describe, expect, it } from 'vitest';
import * as index from '@/index';
import * as internal from '@/internal';

describe('entry points', () => {
  it('exports the public API from the package', () => {
    expect(Object.keys(index).toSorted()).toEqual([
      'InvalidArgumentError',
      'PromiseNotAwaitedError',
      'XPathCompiler',
      'XPathErrorCode',
      'XPathException',
      'XPathExecutable',
      'collectionMap',
    ]);
  });

  it('exports the parser from @exemplarjs/xpath/internal', () => {
    expect(Object.keys(internal)).toEqual(['parseXPath']);
  });
});
