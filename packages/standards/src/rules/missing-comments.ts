import { walk } from '@rosetta/ir';
import type { QualityRule } from './types.js';

/** Flags bots larger than `quality.commentsRequiredAbove` statements with no comment and no Step. */
export const missingComments: QualityRule = {
  id: 'missing-comments',
  area: 'maintainability',
  sides: ['source', 'output'],
  check(bot, profile) {
    const threshold = profile.quality.commentsRequiredAbove;
    let statements = 0;
    let documentation = 0;
    walk(bot.body, (stmt) => {
      if (stmt.kind === 'comment' || stmt.kind === 'group') documentation++;
      else statements++;
    });
    return statements > threshold && documentation === 0
      ? [{ params: { statements, threshold } }]
      : [];
  },
};
