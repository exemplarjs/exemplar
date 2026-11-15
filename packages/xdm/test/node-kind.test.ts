import { describe, expect, it } from 'vitest';
import { kindName, NodeKind } from '@/index';

describe('kindName', () => {
  it('names each kind as dm:node-kind does', () => {
    expect(Object.values(NodeKind).map((kind) => kindName(kind))).toEqual([
      'element',
      'attribute',
      'text',
      'processing-instruction',
      'comment',
      'document',
      'namespace',
    ]);
  });
});
