import type { QualityRuleId } from '../profile.js';
import { deepNesting } from './deep-nesting.js';
import { disabledCode } from './disabled-code.js';
import { emptyCatch } from './empty-catch.js';
import { missingComments } from './missing-comments.js';
import { missingErrorHandling } from './missing-error-handling.js';
import type { QualityRule, RuleCatalogEntry } from './types.js';
import { unusedVariable } from './unused-variable.js';

const implemented = (rule: QualityRule): RuleCatalogEntry => ({ status: 'implemented', rule });

/** Every quality rule id has a slot; `satisfies` makes a missing id a compile error. */
export const ruleCatalog = {
  'missing-error-handling': implemented(missingErrorHandling),
  'empty-catch': implemented(emptyCatch),
  'deep-nesting': implemented(deepNesting),
  'disabled-code': implemented(disabledCode),
  'unused-variable': implemented(unusedVariable),
  'missing-comments': implemented(missingComments),
  'hardcoded-credential': {
    status: 'pending',
    area: 'security',
    waitingFor: 'A-05, A-10: attribute value and credential reference shapes',
  },
  'fixed-delay': {
    status: 'pending',
    area: 'robustness',
    waitingFor: 'A-03: the delay command name from samples',
  },
  'hardcoded-url': {
    status: 'pending',
    area: 'configuration',
    waitingFor: 'A-05: which attributes hold values vs selectors',
  },
  'hardcoded-path': {
    status: 'pending',
    area: 'configuration',
    waitingFor: 'A-05: which attributes hold values vs selectors',
  },
  'hardcoded-email': {
    status: 'pending',
    area: 'configuration',
    waitingFor: 'A-05: which attributes hold values vs selectors',
  },
} as const satisfies Record<QualityRuleId, RuleCatalogEntry>;
