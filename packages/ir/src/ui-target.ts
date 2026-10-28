import type { JsonValue } from './json.js';

/** One way of locating a UI element. Sources often record several. */
export interface SelectorStrategy {
  /** e.g. `xpath`, `css`, `id`, `name`, `path`; open-ended until verified against samples. */
  readonly kind: string;
  readonly value: string;
  /** Whether the source recorder had this strategy switched on. */
  readonly enabled: boolean;
}

/**
 * A UI element an action interacts with. Selector translation is best-effort,
 * so the original capture is always kept in `raw` for the report.
 */
export interface UITarget {
  readonly technology: 'web' | 'desktop' | 'java' | 'sap' | 'terminal' | 'other';
  readonly window?: { readonly title?: string; readonly application?: string };
  readonly strategies: readonly SelectorStrategy[];
  readonly raw: JsonValue;
}
