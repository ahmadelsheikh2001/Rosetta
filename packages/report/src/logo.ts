import { readFileSync } from 'node:fs';

/** Official logo files (B-05), 603 × 155 px with transparent background. */
const files = {
  white: 'valleysoft-white.png',
  dark: 'valleysoft-dark.png',
} as const;

/** Height for a logo rendered `width` px wide, keeping the 603 × 155 aspect ratio. */
export const logoHeight = (width: number): number => Math.round((width * 155) / 603);

/**
 * The logo as a data URI, so the report stays a single offline file (ADR-015).
 * White goes on Black Blue / Oxford Blue, dark on white / Anti-Flash White / Bice Blue (B-04).
 */
export function logoDataUri(variant: keyof typeof files): string {
  const data = readFileSync(new URL(`../assets/logo/${files[variant]}`, import.meta.url));
  return `data:image/png;base64,${data.toString('base64')}`;
}
