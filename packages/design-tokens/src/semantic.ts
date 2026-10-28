import { palette, tint, type BrandColor } from './colors.js';

/** A colour token: a brand colour, optionally tinted toward white. */
export interface ColorRef {
  readonly color: BrandColor;
  readonly tint?: number;
}

/** Role-based colours shared by the report and the future Web UI (ADR-018). */
export const semanticColors = {
  background: { color: 'white' },
  surface: { color: 'white' },
  section: { color: 'antiFlashWhite' },
  border: { color: 'charcoal', tint: 0.8 },
  text: { color: 'blackBlue' },
  textMuted: { color: 'charcoal' },
  heading: { color: 'oxfordBlue' },
  accent: { color: 'biceBlue' },
  interactive: { color: 'dodgerBlue' },
  statusAuto: { color: 'dodgerBlue' },
  statusReview: { color: 'spanishOrange' },
  statusBlocked: { color: 'rust' },
  statusInfo: { color: 'biceBlue' },
} as const satisfies Record<string, ColorRef>;

export type SemanticColor = keyof typeof semanticColors;

/** Resolves a colour token to its HEX value. */
export function resolveColor(ref: ColorRef): string {
  return ref.tint === undefined ? palette[ref.color] : tint(ref.color, ref.tint);
}

export type Status = 'auto' | 'review' | 'blocked' | 'info';

/**
 * Finding statuses. Colour is never used alone: every status is rendered with
 * its icon and its text label (resolved from the report string catalog).
 * PENDING MARKETING APPROVAL (ADR-018).
 */
export const statuses = {
  auto: { color: 'statusAuto', icon: 'check', labelId: 'status.auto' },
  review: { color: 'statusReview', icon: 'eye', labelId: 'status.review' },
  blocked: { color: 'statusBlocked', icon: 'block', labelId: 'status.blocked' },
  info: { color: 'statusInfo', icon: 'info', labelId: 'status.info' },
} as const satisfies Record<
  Status,
  { color: SemanticColor; icon: string; labelId: `status.${Status}` }
>;
