import { walk, type Bot, type Statement } from '@rosetta/ir';
import type { Size, StandardsProfile } from '@rosetta/standards';

/** Measured inputs of the complexity score; names match `sizing.weights` in the profile. */
export interface BotMetrics {
  /** Statements excluding comments and Steps. */
  readonly nodes: number;
  /** Deepest if/loop/try nesting; Steps do not count. */
  readonly maxDepth: number;
  readonly packages: number;
  /** Actions with a UI target. */
  readonly uiActions: number;
  readonly subBotCalls: number;
  /** Actions and unknown nodes that need manual conversion. */
  readonly unmapped: number;
  readonly errorHandlers: number;
}

export interface Complexity {
  readonly score: number;
  readonly size: Size;
  /** Estimated hours from `sizing.hoursPerSize`; uncalibrated until a pilot (ADR-013). */
  readonly hours: number;
}

const isControl = (s: Statement): boolean =>
  s.kind === 'if' || s.kind === 'loop' || s.kind === 'try';

/** Measures a bot. `unmapped` comes from coverage, which needs the registry. */
export function measure(bot: Bot, unmapped: number): BotMetrics {
  let nodes = 0;
  let maxDepth = 0;
  let uiActions = 0;
  let subBotCalls = 0;
  let errorHandlers = 0;
  walk(bot.body, (stmt, ctx) => {
    if (stmt.kind !== 'comment' && stmt.kind !== 'group') nodes++;
    if (isControl(stmt)) maxDepth = Math.max(maxDepth, ctx.ancestors.filter(isControl).length + 1);
    if (stmt.kind === 'action' && stmt.target) uiActions++;
    if (stmt.kind === 'callBot') subBotCalls++;
    if (stmt.kind === 'try') errorHandlers++;
  });
  return {
    nodes,
    maxDepth,
    packages: bot.packages.length,
    uiActions,
    subBotCalls,
    unmapped,
    errorHandlers,
  };
}

/** Weighted complexity score, size bucket and hours, all driven by the profile. */
export function complexity(metrics: BotMetrics, profile: StandardsProfile): Complexity {
  const { weights, thresholds, hoursPerSize } = profile.sizing;
  const score = Math.round(
    (Object.keys(weights) as (keyof BotMetrics)[]).reduce(
      (sum, key) => sum + weights[key] * metrics[key],
      0,
    ),
  );
  const size: Size =
    score <= thresholds.S ? 'S' : score <= thresholds.M ? 'M' : score <= thresholds.L ? 'L' : 'XL';
  return { score, size, hours: hoursPerSize[size] };
}
