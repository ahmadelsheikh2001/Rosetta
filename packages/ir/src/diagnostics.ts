import type { SourceRef } from './source-ref.js';

export type Severity = 'info' | 'warning' | 'error';

export type DiagnosticCategory =
  | 'parse'
  | 'unmapped'
  | 'selector'
  | 'credential'
  | 'semantic-difference'
  | 'disabled-code'
  | 'quality'
  | 'standards-conflict'
  | 'ai-suggested';

/**
 * A finding attached to the IR. Text is not stored here: `messageId` + `params`
 * are resolved against the report's string catalog so the report can be translated (ADR-010).
 */
export interface Diagnostic {
  /** Stable code, e.g. `A360-PARSE-001`, `QUAL-HARDCODED-CREDENTIAL`. */
  readonly code: string;
  readonly severity: Severity;
  readonly category: DiagnosticCategory;
  readonly messageId: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly source?: SourceRef;
  /** IR statement id the finding is about, when it concerns a single node. */
  readonly nodeId?: string;
}
