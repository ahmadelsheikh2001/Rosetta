import { palette, type BrandColor } from './colors.js';
import { resolveColor, semanticColors, type SemanticColor } from './semantic.js';
import { fontFamilies, fontSizes, headline, textAlign } from './typography.js';

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Renders all tokens as CSS custom properties plus the base typography rules.
 * Font files are not referenced here; the report bundles `@font-face` rules
 * pointing at local files (ADR-018).
 */
export function toCss(): string {
  const brand = (Object.keys(palette) as BrandColor[]).map(
    (name) => `  --vs-${kebab(name)}: ${palette[name]};`,
  );
  const roles = (Object.keys(semanticColors) as SemanticColor[]).map(
    (name) => `  --color-${kebab(name)}: ${resolveColor(semanticColors[name])};`,
  );
  const sizes = Object.entries(fontSizes).map(([name, size]) => `  --font-size-${name}: ${size};`);
  const families = [
    `  --font-body: '${fontFamilies.body.family}', ${fontFamilies.body.fallback};`,
    `  --font-headline: '${fontFamilies.headline.family}', ${fontFamilies.headline.fallback};`,
  ];

  return [
    ':root {',
    ...brand,
    ...roles,
    ...families,
    ...sizes,
    '}',
    '',
    'body {',
    '  font-family: var(--font-body);',
    '  font-weight: 400;',
    '  color: var(--color-text);',
    '  background: var(--color-background);',
    `  text-align: ${textAlign};`,
    '}',
    '',
    'h1, h2, h3, .headline {',
    '  font-family: var(--font-headline);',
    '  font-weight: 700;',
    '  color: var(--color-heading);',
    `  text-transform: ${headline.textTransform};`,
    `  letter-spacing: ${headline.letterSpacing};`,
    '}',
    '',
  ].join('\n');
}
