import { z } from 'zod';

const caseStyle = z.enum(['camelCase', 'PascalCase', 'snake_case', 'UPPER_SNAKE']);

/** Must list every `IRTypeKind`; kept in sync by `profile.test.ts`. */
export const irTypeKinds = z.enum([
  'string',
  'number',
  'boolean',
  'datetime',
  'list',
  'dict',
  'table',
  'record',
  'credential',
  'handle',
  'any',
  'unknown',
]);

export const headerField = z.enum([
  'name',
  'description',
  'sourceRef',
  'convertedAt',
  'rosettaVersion',
  'inputs',
  'outputs',
]);

/** Source-side and output-side quality rules (Source/Output Checker). */
export const qualityRuleId = z.enum([
  'hardcoded-credential',
  'missing-error-handling',
  'empty-catch',
  'fixed-delay',
  'hardcoded-url',
  'hardcoded-path',
  'hardcoded-email',
  'disabled-code',
  'deep-nesting',
  'missing-comments',
  'unused-variable',
]);
export type QualityRuleId = z.infer<typeof qualityRuleId>;

const ruleSetting = z
  .object({ enabled: z.boolean(), severity: z.enum(['info', 'warning', 'error']) })
  .strict();

const sizes = z.enum(['S', 'M', 'L', 'XL']);
export type Size = z.infer<typeof sizes>;

/**
 * A fully resolved standards profile (ADR-008). Layers (company, client,
 * project overrides) are merged into this shape before use.
 */
export const standardsProfile = z
  .object({
    profile: z.string().min(1),
    version: z.number().int().positive(),

    naming: z
      .object({
        variable: z
          .object({
            case: caseStyle,
            /** Optional type-aware prefix, e.g. `{ string: 'str' }`. */
            typePrefix: z.partialRecord(irTypeKinds, z.string()),
          })
          .strict(),
        subroutine: z.object({ case: caseStyle }).strict(),
        /** Placeholders: `{client}`, `{process}`, `{bot}`. */
        script: z.object({ pattern: z.string().min(1) }).strict(),
      })
      .strict(),

    header: z.object({ fields: z.array(headerField).min(1) }).strict(),

    config: z
      .object({
        /** Abstract mechanism; its WAL form is fixed once verified by the probe script (ADR-017). */
        mechanism: z.enum(['configFile', 'scriptParameters', 'serverParameters']),
        extract: z.array(z.enum(['url', 'path', 'email'])),
      })
      .strict(),

    logging: z
      .object({
        /** Placeholders: `{stage}`, `{level}`, `{message}`. */
        format: z.string().min(1),
        stepBoundaries: z.boolean(),
        /** Business values are logged only when annotated in project overrides. */
        businessValues: z.literal('annotated-only'),
      })
      .strict(),

    errors: z
      .object({
        defaultCategory: z.enum(['business', 'system']),
        screenshotOnSystemError: z.boolean(),
        transparentWrappers: z.enum(['off', 'guarded']),
      })
      .strict(),

    /** Behavioral transforms: off unless explicitly opted in (ADR-008). */
    behavioral: z.object({ replaceDelayWithWait: z.boolean(), addRetries: z.boolean() }).strict(),

    quality: z
      .object({
        rules: z.record(qualityRuleId, ruleSetting),
        maxNestingDepth: z.number().int().positive(),
      })
      .strict(),

    sizing: z
      .object({
        /** False until hours are calibrated on a pilot; the report shows a caveat. */
        calibrated: z.boolean(),
        weights: z
          .object({
            nodes: z.number().nonnegative(),
            maxDepth: z.number().nonnegative(),
            packages: z.number().nonnegative(),
            uiActions: z.number().nonnegative(),
            subBotCalls: z.number().nonnegative(),
            unmapped: z.number().nonnegative(),
            errorHandlers: z.number().nonnegative(),
          })
          .strict(),
        /** Upper bound (inclusive) of the complexity score for S, M and L; above L is XL. */
        thresholds: z
          .object({ S: z.number(), M: z.number(), L: z.number() })
          .strict()
          .refine((t) => t.S < t.M && t.M < t.L, 'thresholds must increase: S < M < L'),
        hoursPerSize: z.record(sizes, z.number().positive()),
      })
      .strict(),
  })
  .strict();

export type StandardsProfile = z.infer<typeof standardsProfile>;
