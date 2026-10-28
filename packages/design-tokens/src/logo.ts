import type { BrandColor } from './colors.js';

/**
 * Logo usage rules (ADR-018). Only the official SVG artwork is used, exactly
 * as provided: no recolouring, rotating, stretching, skewing, effects or
 * custom lockups. The primary logo's "CENTER OF EXCELLENCE" tagline is part of
 * the artwork.
 */
export const logoRules = {
  /** Minimum clear space on every side, as a fraction of the logo width. Nothing inside it. */
  minClearSpaceRatio: 1 / 8,
} as const;

/** Minimum clear space in px for a logo rendered `widthPx` wide. */
export function logoClearSpace(widthPx: number): number {
  return Math.ceil(widthPx * logoRules.minClearSpaceRatio);
}

/**
 * Logo variations allowed in Rosetta. The Anniversary (20 years) edition is
 * deliberately excluded.
 * - `primary`: preferred; use whenever possible.
 * - `icon`: the "V" mark alone, for tight spaces (favicon, header badge).
 * - `secondary`: stacked, icon above the wordmark.
 */
export type LogoVariant = 'primary' | 'icon' | 'secondary';

/** `dark` = Black Blue artwork; `white` = white artwork. */
export type LogoColorVersion = 'dark' | 'white';

/** Backgrounds the logo may sit on, and which colour version goes on each. Never on imagery. */
export const logoBackgrounds = {
  white: 'dark',
  antiFlashWhite: 'dark',
  biceBlue: 'dark',
  blackBlue: 'white',
  oxfordBlue: 'white',
} as const satisfies Partial<Record<BrandColor, LogoColorVersion>>;

export type LogoBackground = keyof typeof logoBackgrounds;

/** Returns the logo colour version for a background, or `undefined` if the logo must not be placed there. */
export function logoVersionFor(background: BrandColor): LogoColorVersion | undefined {
  return background in logoBackgrounds ? logoBackgrounds[background as LogoBackground] : undefined;
}

/**
 * Expected official artwork file names in `packages/design-tokens/assets/logo/`.
 * Until marketing delivers them, UIs render a text placeholder, never a redrawn logo.
 */
export function logoFileName(variant: LogoVariant, version: LogoColorVersion): string {
  return `valleysoft-${variant}-${version}.svg`;
}
