import type { Bot, Statement, Variable } from '@rosetta/ir';
import type { QualityRuleId, StandardsProfile } from '../profile.js';

/** Quality dimension a rule contributes to; used to group findings in the report. */
export type QualityArea = 'robustness' | 'maintainability' | 'security' | 'configuration';

/** Source Checker runs on the lifted source bot; Output Checker on generated code (Phase 2). */
export type RuleSide = 'source' | 'output';

/** One violation found by a rule, before severity and message ids are applied. */
export interface RuleFinding {
  /** Statement the finding is about; omit for bot-level findings. */
  readonly node?: Statement;
  /** Variable the finding is about, for variable-level findings. */
  readonly variable?: Variable;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** A quality rule expressed purely on the IR. */
export interface QualityRule {
  readonly id: QualityRuleId;
  readonly area: QualityArea;
  readonly sides: readonly RuleSide[];
  check(bot: Bot, profile: StandardsProfile): readonly RuleFinding[];
}

/**
 * Slot in the rule catalog. `pending` rules need platform-specific knowledge
 * (e.g. A360 field shapes) and are implemented once verified samples exist (ADR-017).
 */
export type RuleCatalogEntry =
  | { readonly status: 'implemented'; readonly rule: QualityRule }
  | { readonly status: 'pending'; readonly area: QualityArea; readonly waitingFor: string };
