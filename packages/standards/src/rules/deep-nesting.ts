import { walk, type Statement } from '@rosetta/ir';
import type { QualityRule, RuleFinding } from './types.js';

const isControl = (s: Statement): boolean =>
  s.kind === 'if' || s.kind === 'loop' || s.kind === 'try';

/**
 * Flags control blocks nested deeper than `quality.maxNestingDepth`. Steps
 * (groups) do not count. Reported once, at the first level that exceeds the limit.
 */
export const deepNesting: QualityRule = {
  id: 'deep-nesting',
  area: 'maintainability',
  sides: ['source', 'output'],
  check(bot, profile) {
    const max = profile.quality.maxNestingDepth;
    const findings: RuleFinding[] = [];
    walk(bot.body, (stmt, ctx) => {
      if (!isControl(stmt)) return;
      const level = ctx.ancestors.filter(isControl).length + 1;
      if (level === max + 1) findings.push({ node: stmt, params: { level, max } });
    });
    return findings;
  },
};
