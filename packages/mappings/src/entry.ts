import { z } from 'zod';

/**
 * Coverage status of a registry entry (ADR-005).
 * - `planned`: known command, no conversion yet (counts as unmapped in coverage).
 * - `partial`: converts, but some attributes/semantics need manual review.
 * - `mapped`: converts fully.
 * - `unsupported`: deliberately not converted; always manual.
 */
export const mappingStatus = z.enum(['planned', 'partial', 'mapped', 'unsupported']);
export type MappingStatus = z.infer<typeof mappingStatus>;

/** Statuses that claim conversion and therefore require a test fixture. */
export const testedStatuses: readonly MappingStatus[] = ['partial', 'mapped'];

const identifier = z
  .string()
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'lower-case, dot/dash separated');

/**
 * One source command → IR op mapping ("lift" side). The IR op → target side
 * ("lower") is added with the WAL generator in Phase 2.
 */
export const mappingEntry = z
  .object({
    id: identifier,
    source: z.object({
      platform: z.literal('a360'),
      /** Package and command names exactly as they appear in the export (verified against corpus). */
      package: z.string().min(1),
      command: z.string().min(1),
    }),
    status: mappingStatus,
    /** Canonical IR op, e.g. `excel.open`. Required unless status is `planned` or `unsupported`. */
    irOp: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/)
      .optional(),
    /** Name of a TS handler in `src/handlers/` for logic a table cannot express. */
    handler: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*$/)
      .optional(),
    /** Corpus files that show this command, e.g. `corpus/a360/01-variables/...`. */
    evidence: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .strict()
  .refine((e) => e.irOp !== undefined || e.status === 'planned' || e.status === 'unsupported', {
    message: 'irOp is required for partial and mapped entries',
    path: ['irOp'],
  });

export type MappingEntry = z.infer<typeof mappingEntry>;
