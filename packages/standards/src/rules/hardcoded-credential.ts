import type { QualityRule } from './types.js';

/**
 * Flags credential variables that carry a literal value instead of a vault
 * reference. Shapes verified (A-10): corpus 01, a `credential` variable whose
 * default is a non-empty literal; corpus 08, a vault reference, lifted to a
 * `credential.vault` call and therefore not flagged. A literal in a plain
 * String variable (08 `vHardcoded`) carries no secret marker and is not detected.
 */
export const hardcodedCredential: QualityRule = {
  id: 'hardcoded-credential',
  area: 'security',
  sides: ['source', 'output'],
  check(bot) {
    return bot.variables
      .filter(
        (v) =>
          v.type.kind === 'credential' &&
          v.defaultValue?.kind === 'literal' &&
          typeof v.defaultValue.value === 'string' &&
          v.defaultValue.value !== '',
      )
      .map((v) => ({ variable: v, params: { variable: v.name } }));
  },
};
