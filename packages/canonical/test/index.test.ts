import { describe, expect, it } from 'vitest';
import * as canonical from '@/index';

describe('@exemplarjs/canonical', () => {
  it('exports canonicalize, canonicalizeAsync and the error for a bad argument, and nothing else at run time', () => {
    expect(Object.keys(canonical).toSorted()).toEqual(['InvalidArgumentError', 'canonicalize', 'canonicalizeAsync']);
  });

  it('accepts every method its type names', () => {
    const methods: canonical.CanonicalMethod[] = ['c14n', 'c14n11', 'exc-c14n', 'suite-first', 'suite-second'];
    const options: canonical.CanonicalizeOptions = { comments: false };
    for (const method of methods) expect(canonical.canonicalize('<a/>', { ...options, method })).toBe('<a></a>');
  });
});
