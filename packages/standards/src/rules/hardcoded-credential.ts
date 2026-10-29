import type { QualityRule } from './types.js';

/**
 * Flags credential variables that carry a literal value instead of a vault
 * reference. Shape verified on corpus 01 (A-10, partly): a `credential`
 * variable whose default is a non-empty literal. Literal passwords passed
 * directly to commands are not detected yet: that needs the vault reference
 * shape from sample 08.
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
