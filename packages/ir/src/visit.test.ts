import { describe, expect, it } from 'vitest';
import type { Block, Statement } from './statements.js';
import { childBlocks, walk } from './visit.js';

const comment = (id: string): Statement => ({ id, kind: 'comment', text: id });
const truthy = { kind: 'literal', value: true } as const;

const tree: Block = [
  comment('a'),
  {
    id: 'if1',
    kind: 'if',
    branches: [
      { condition: truthy, body: [comment('b')] },
      { condition: truthy, body: [comment('c')] },
    ],
    else: [
      {
        id: 'try1',
        kind: 'try',
        body: [comment('d')],
        catches: [{ body: [comment('e')] }],
        finally: [comment('f')],
      },
    ],
  },
];

describe('childBlocks', () => {
  it('returns branches, else, try, catch and finally blocks in source order', () => {
    const ifStmt = tree[1];
    if (ifStmt === undefined) throw new Error('fixture');
    expect(childBlocks(ifStmt)).toHaveLength(3);
  });

  it('returns no blocks for leaf statements', () => {
    expect(childBlocks(comment('x'))).toEqual([]);
  });
});

describe('walk', () => {
  it('visits all statements depth-first with depth and ancestors', () => {
    const seen: string[] = [];
    walk(tree, (stmt, ctx) => {
      seen.push(`${stmt.id}@${ctx.depth}<${ctx.ancestors.map((a) => a.id).join('/')}>`);
    });
    expect(seen).toEqual([
      'a@0<>',
      'if1@0<>',
      'b@1<if1>',
      'c@1<if1>',
      'try1@1<if1>',
      'd@2<if1/try1>',
      'e@2<if1/try1>',
      'f@2<if1/try1>',
    ]);
  });
});
