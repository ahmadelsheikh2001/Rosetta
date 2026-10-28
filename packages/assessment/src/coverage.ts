import type { SourceRef, Statement } from '@rosetta/ir';
import type { MappingEntry, MappingStatus } from '@rosetta/mappings';

/** Registry entries by id. */
export type RegistryIndex = ReadonlyMap<string, MappingEntry>;

/** How a convertible item is expected to convert. */
export type CoverageBucket = 'mapped' | 'partial' | 'manual';

/** Why an item lands where it does. */
export type CoverageReason = MappingStatus | 'not-in-registry' | 'unknown-node';

/** One action or unknown node, classified against the registry. */
export interface CoverageItem {
  readonly nodeId: string;
  /** IR op, or `unknown` for nodes the parser could not read. */
  readonly op: string;
  readonly bucket: CoverageBucket;
  readonly reason: CoverageReason;
  readonly mappingId?: string;
  readonly source?: SourceRef;
}

export interface Coverage {
  readonly mapped: number;
  readonly partial: number;
  readonly manual: number;
  readonly total: number;
  /** (mapped + partial) / total, 0–100; 100 when there is nothing to convert. */
  readonly percent: number;
}

const bucketOf: Record<MappingStatus, CoverageBucket> = {
  mapped: 'mapped',
  partial: 'partial',
  planned: 'manual',
  unsupported: 'manual',
};

/**
 * Classifies a statement for coverage. Only actions and unknown nodes count:
 * control flow (if, loop, try, ...) is converted by the core, not by mappings.
 */
export function classify(stmt: Statement, registry: RegistryIndex): CoverageItem | undefined {
  const base = { nodeId: stmt.id, ...(stmt.source ? { source: stmt.source } : {}) };
  if (stmt.kind === 'unknown') {
    return { ...base, op: 'unknown', bucket: 'manual', reason: 'unknown-node' };
  }
  if (stmt.kind !== 'action') return undefined;
  const entry = stmt.mappingId === undefined ? undefined : registry.get(stmt.mappingId);
  if (!entry) return { ...base, op: stmt.op, bucket: 'manual', reason: 'not-in-registry' };
  return {
    ...base,
    op: stmt.op,
    bucket: bucketOf[entry.status],
    reason: entry.status,
    mappingId: entry.id,
  };
}

/** Sums classified items into a coverage summary. */
export function summarize(items: readonly Pick<CoverageItem, 'bucket'>[]): Coverage {
  const count = (b: CoverageBucket) => items.filter((i) => i.bucket === b).length;
  return fromCounts(count('mapped'), count('partial'), count('manual'));
}

/** Builds a coverage summary from bucket counts. */
export function fromCounts(mapped: number, partial: number, manual: number): Coverage {
  const total = mapped + partial + manual;
  const percent = total === 0 ? 100 : Math.round(((mapped + partial) / total) * 1000) / 10;
  return { mapped, partial, manual, total, percent };
}
