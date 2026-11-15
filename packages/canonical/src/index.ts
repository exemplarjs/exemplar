/** @exemplarjs/canonical: Canonical XML 1.0 and 1.1, Exclusive Canonicalization, and the XML suite's canonical forms. */
export { InvalidArgumentError } from '@exemplarjs/xml';
export {
  type CanonicalInput,
  type CanonicalMethod,
  type CanonicalizeOptions,
  canonicalize,
  canonicalizeAsync,
} from './canonicalize.ts';
export type { CanonicalNode } from './tree.ts';
