import { walk } from '@rosetta/ir';
import type { QualityRule, RuleFinding } from './types.js';

/** Lists disabled statements; never carried over silently. Children of a disabled statement are not repeated. */
export const disabledCode: QualityRule = {
  id: 'disabled-code',
  area: 'maintainability',
  sides: ['source'],
  check(bot) {
    const findings: RuleFinding[] = [];
    walk(bot.body, (stmt, ctx) => {
      if (stmt.disabled && !ctx.ancestors.some((a) => a.disabled)) {
        findings.push({ node: stmt, params: { kind: stmt.kind } });
      }
    });
    return findings;
  },
};
