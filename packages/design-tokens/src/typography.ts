/**
 * RPA Rosetta typography (ADR-018). Only these two families are allowed; both
 * are open-licensed and must be bundled locally (no CDN, no network).
 */
export const fontFamilies = {
  body: { family: 'Montserrat', fallback: 'Arial, sans-serif' },
  headline: { family: 'Chakra Petch', fallback: 'Arial, sans-serif' },
} as const;

/** Weights allowed per family. Montserrat 600 is restricted to subheadings/signposting. */
export const fontWeights = {
  body: { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 },
  headline: { light: 300, medium: 500, bold: 700 },
} as const;

/** Headline rules: uppercase, tracking 100 (0.1em). */
export const headline = {
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
} as const;

/** Text is always left-aligned; body copy is sentence case (enforced in content, not CSS). */
export const textAlign = 'left' as const;

/** Type scale in rem. */
export const fontSizes = {
  xs: '0.75rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.25rem',
  xl: '1.5rem',
  xxl: '2rem',
} as const;
