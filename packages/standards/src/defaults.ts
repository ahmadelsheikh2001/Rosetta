import type { StandardsProfile } from './profile.js';

const on = { enabled: true, severity: 'warning' } as const;

/**
 * Built-in defaults: generic IBM RPA best practices. The company profile
 * (from the internal conventions document) layers on top of this.
 * Sizing numbers are placeholders until calibrated on the first pilot.
 */
export const defaultProfile: StandardsProfile = {
  profile: 'rosetta-defaults',
  version: 1,
  naming: {
    variable: { case: 'camelCase', typePrefix: {} },
    subroutine: { case: 'PascalCase' },
    script: { pattern: '{process}_{bot}' },
  },
  header: {
    fields: [
      'name',
      'description',
      'sourceRef',
      'convertedAt',
      'rosettaVersion',
      'inputs',
      'outputs',
    ],
  },
  config: { mechanism: 'configFile', extract: ['url', 'path', 'email'] },
  logging: {
    format: '[{stage}] [{level}] {message}',
    stepBoundaries: true,
    businessValues: 'annotated-only',
  },
  errors: {
    defaultCategory: 'system',
    screenshotOnSystemError: true,
    transparentWrappers: 'guarded',
  },
  behavioral: { replaceDelayWithWait: false, addRetries: false },
  quality: {
    rules: {
      'hardcoded-credential': { enabled: true, severity: 'error' },
      'missing-error-handling': on,
      'empty-catch': on,
      'fixed-delay': on,
      'hardcoded-url': on,
      'hardcoded-path': on,
      'hardcoded-email': on,
      'disabled-code': { enabled: true, severity: 'info' },
      'deep-nesting': on,
      'missing-comments': { enabled: true, severity: 'info' },
      'unused-variable': { enabled: true, severity: 'info' },
    },
    maxNestingDepth: 4,
  },
  sizing: {
    calibrated: false,
    weights: {
      nodes: 1,
      maxDepth: 5,
      packages: 3,
      uiActions: 2,
      subBotCalls: 3,
      unmapped: 8,
      errorHandlers: 1,
    },
    thresholds: { S: 50, M: 150, L: 400 },
    hoursPerSize: { S: 4, M: 12, L: 32, XL: 64 },
  },
};
