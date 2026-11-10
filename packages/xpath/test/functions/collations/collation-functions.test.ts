import { describe, expect, it } from 'vitest';
import { errorCode, evaluate, strings } from '../../helpers/evaluate.ts';

const HTML = '"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"';
const UCA = '"http://www.w3.org/2013/collation/UCA?strength=primary"';

describe('collation-key', () => {
  it('gives keys that order as the codepoint collation compares', () => {
    expect(evaluate('collation-key("é")')).toEqual(['xs:base64Binary w6k=']);
    expect(strings('string(collation-key("a") lt collation-key("b"))')).toEqual(['true']);
  });

  it('gives equal keys for strings a collation finds equal', () => {
    expect(strings(`string(collation-key("ABC", ${HTML}) eq collation-key("abc", ${HTML}))`)).toEqual(['true']);
  });

  it('raises FOCH0004 for a collation that gives no keys', () => {
    expect(errorCode(`collation-key("a", ${UCA})`)).toBe('FOCH0004');
  });
});
