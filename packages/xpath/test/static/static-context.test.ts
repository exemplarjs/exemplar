import { describe, expect, it } from 'vitest';
import { intlSupports } from '@/static/static-context';

describe('intlSupports', () => {
  it('knows which languages an Intl service supports, and that a malformed tag is none', () => {
    const supported = (language: string): boolean[] => [
      intlSupports(Intl.DateTimeFormat, language),
      intlSupports(Intl.Collator, language),
    ];
    expect([supported('de'), supported('xib'), supported('@*!')]).toEqual([
      [true, true],
      [false, false],
      [false, false],
    ]);
  });
});
