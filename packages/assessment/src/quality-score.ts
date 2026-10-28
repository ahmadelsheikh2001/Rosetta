import type { Diagnostic } from '@rosetta/ir';
import type { StandardsProfile } from '@rosetta/standards';

/**
 * Source Quality Score, 0–100: 100 minus the profile's penalty for each finding
 * by severity, floored at 0.
 */
export function qualityScore(findings: readonly Diagnostic[], profile: StandardsProfile): number {
  const penalty = findings.reduce((sum, d) => sum + profile.quality.scorePenalty[d.severity], 0);
  return Math.max(0, Math.round(100 - penalty));
}

/** Portfolio score: bot scores weighted by bot size (statements), so tiny bots don't dominate. */
export function weightedScore(bots: readonly { score: number; nodes: number }[]): number {
  const weight = (n: number) => Math.max(1, n);
  const total = bots.reduce((s, b) => s + weight(b.nodes), 0);
  if (total === 0) return 100;
  return Math.round(bots.reduce((s, b) => s + b.score * weight(b.nodes), 0) / total);
}
