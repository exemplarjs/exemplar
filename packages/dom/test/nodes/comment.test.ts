import { newDocument } from '@test/helpers/dom';
import { describe, expect, it } from 'vitest';
import type { Comment } from '@/index';

describe('Comment', () => {
  it('is a comment node named #comment', () => {
    const comment: Comment = newDocument().createComment(' c ');
    expect([comment.nodeType, comment.nodeName, comment.data, comment.textContent]).toEqual([
      8,
      '#comment',
      ' c ',
      ' c ',
    ]);
  });

  it('clones with its data', () => {
    expect(newDocument().createComment('c').cloneNode().nodeValue).toBe('c');
  });
});
