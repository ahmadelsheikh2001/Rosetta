import type { Bot, Diagnostic } from '@rosetta/ir';
import type { QualityRuleId, StandardsProfile } from '../profile.js';
import { ruleCatalog } from './catalog.js';
import type { QualityArea, RuleCatalogEntry, RuleSide } from './types.js';

/** Stable diagnostic code for a quality rule, e.g. `QUAL-EMPTY-CATCH`. */
export const qualityCode = (id: QualityRuleId): string => `QUAL-${id.toUpperCase()}`;

/** Report catalog key for a quality rule's message. */
export const qualityMessageId = (id: QualityRuleId): string => `quality.${id}`;

const entries = Object.entries(ruleCatalog) as [QualityRuleId, RuleCatalogEntry][];

/** Area of a rule, implemented or pending. */
export function ruleArea(id: QualityRuleId): QualityArea {
  const entry: RuleCatalogEntry = ruleCatalog[id];
  return entry.status === 'implemented' ? entry.rule.area : entry.area;
}

/** Ids of rules that are still pending samples, for the report's "not yet checked" note. */
export function pendingRules(): QualityRuleId[] {
  return entries.filter(([, e]) => e.status === 'pending').map(([id]) => id);
}

/**
 * Runs every implemented and enabled rule for `side` on one bot.
 * Severity comes from the profile; findings are returned as IR diagnostics.
 */
export function checkBot(
  bot: Bot,
  profile: StandardsProfile,
  side: RuleSide = 'source',
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [id, entry] of entries) {
    const setting = profile.quality.rules[id];
    if (entry.status !== 'implemented' || !setting.enabled) continue;
    if (!entry.rule.sides.includes(side)) continue;
    for (const finding of entry.rule.check(bot, profile)) {
      const source = finding.node?.source ?? finding.variable?.source ?? bot.source;
      diagnostics.push({
        code: qualityCode(id),
        severity: setting.severity,
        category: 'quality',
        messageId: qualityMessageId(id),
        params: { bot: bot.name, ...finding.params },
        source,
        ...(finding.node ? { nodeId: finding.node.id } : {}),
      });
    }
  }
  return diagnostics;
}
