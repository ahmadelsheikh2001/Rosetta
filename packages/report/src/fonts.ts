import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fontFamilies, fontWeights } from '@rosetta/design-tokens';

const require = createRequire(import.meta.url);

const packages = {
  body: { pkg: '@fontsource/montserrat', file: 'montserrat' },
  headline: { pkg: '@fontsource/chakra-petch', file: 'chakra-petch' },
} as const;

/**
 * `@font-face` rules with the brand fonts embedded as data URIs (Latin subset),
 * so the report renders identically offline (ADR-015, ADR-018). Both fonts are
 * SIL Open Font License 1.1, which permits embedding.
 */
export function fontFaceCss(): string {
  const rules: string[] = [];
  for (const role of ['body', 'headline'] as const) {
    const { pkg, file } = packages[role];
    for (const weight of Object.values(fontWeights[role])) {
      const path = require.resolve(`${pkg}/files/${file}-latin-${weight}-normal.woff2`);
      const data = readFileSync(path).toString('base64');
      rules.push(
        [
          '@font-face {',
          `  font-family: '${fontFamilies[role].family}';`,
          '  font-style: normal;',
          `  font-weight: ${weight};`,
          '  font-display: block;',
          `  src: url(data:font/woff2;base64,${data}) format('woff2');`,
          '}',
        ].join('\n'),
      );
    }
  }
  return rules.join('\n');
}
