import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { parseXPath } from '@/internal';
import { printXPath } from '../helpers/print-syntax.ts';
import { expression } from '../helpers/syntax-arbitraries.ts';
import { shape } from '../helpers/syntax.ts';

// The nightly run scales the number of runs up.
const SCALE = Number(globalThis.process?.env['EXEMPLAR_FUZZ_SCALE'] ?? 1);
const RUNS = { numRuns: 1000 * SCALE };

test.prop([expression], RUNS)('parses a printed syntax tree back to the same tree', (tree) => {
  const reparsed = parseXPath(printXPath(tree));
  expect(shape(reparsed)).toEqual(shape(tree));
});

test.prop([fc.string({ unit: 'binary', maxLength: 30 })], RUNS)(
  'raises only XPathExceptions on arbitrary text',
  (text) => {
    try {
      parseXPath(text);
    } catch (error) {
      expect(error).toMatchObject({ name: 'XPathException' });
    }
  }
);
