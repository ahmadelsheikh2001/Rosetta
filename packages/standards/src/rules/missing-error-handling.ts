import { walk } from '@rosetta/ir';
import type { QualityRule } from './types.js';

/** Flags a bot that performs work but has no Try block anywhere. */
export const missingErrorHandling: QualityRule = {
  id: 'missing-error-handling',
  area: 'robustness',
  sides: ['source', 'output'],
  check(bot) {
    let work = 0;
    let handlers = 0;
    walk(bot.body, (stmt) => {
      if (stmt.kind === 'action' || stmt.kind === 'callBot') work++;
      if (stmt.kind === 'try' && !stmt.disabled) handlers++;
    });
    return work > 0 && handlers === 0 ? [{ params: { actions: work } }] : [];
  },
};
