import { describe, expect, it } from 'vitest';
import { abandon } from '@/util/promises';

describe('abandon', () => {
  it('handles the rejection of a promise no one waits for, and leaves the promise as it is', async () => {
    const failure = new Error('late');
    const promise = Promise.reject(failure);
    abandon(promise);
    abandon(Promise.resolve(1));
    await expect(promise).rejects.toBe(failure);
  });
});
