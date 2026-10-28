import { referencedVariables, statementExprs, walk, type Expr } from '@rosetta/ir';
import type { QualityRule } from './types.js';

/**
 * Flags local variables that are declared but never referenced.
 * Inputs and outputs are the bot's interface and are never flagged.
 */
export const unusedVariable: QualityRule = {
  id: 'unused-variable',
  area: 'maintainability',
  sides: ['source', 'output'],
  check(bot) {
    const exprs: Expr[] = bot.variables.flatMap((v) => (v.defaultValue ? [v.defaultValue] : []));
    walk(bot.body, (stmt) => exprs.push(...statementExprs(stmt)));
    const used = referencedVariables(exprs);
    return bot.variables
      .filter((v) => v.direction === 'local' && !used.has(v.name))
      .map((v) => ({ variable: v, params: { variable: v.name } }));
  },
};
