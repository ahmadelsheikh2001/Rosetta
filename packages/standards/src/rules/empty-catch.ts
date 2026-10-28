import { walk, type Block } from '@rosetta/ir';
import type { QualityRule, RuleFinding } from './types.js';

/** True when a block does nothing: empty, or only comments and disabled statements. */
const doesNothing = (block: Block): boolean =>
  block.every((s) => s.kind === 'comment' || s.disabled === true);

/** Flags catch clauses that silently swallow the error. */
export const emptyCatch: QualityRule = {
  id: 'empty-catch',
  area: 'robustness',
  sides: ['source', 'output'],
  check(bot) {
    const findings: RuleFinding[] = [];
    walk(bot.body, (stmt) => {
      if (stmt.kind !== 'try') return;
      stmt.catches.forEach((c, i) => {
        if (doesNothing(c.body)) findings.push({ node: stmt, params: { catch: i + 1 } });
      });
    });
    return findings;
  },
};
