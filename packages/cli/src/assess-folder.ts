import { assess, type AssessmentResult } from '@rosetta/assessment';
import type { MappingEntry } from '@rosetta/mappings';
import { readFolder, type MappingLookup } from '@rosetta/source-a360';
import type { StandardsProfile } from '@rosetta/standards';

/** Registry lookup by A360 package and command, injected into the reader (ADR-002). */
export function lookupFrom(entries: readonly MappingEntry[]): MappingLookup {
  const byCommand = new Map(entries.map((e) => [`${e.source.package}/${e.source.command}`, e]));
  return (packageName, commandName) => {
    const entry = byCommand.get(`${packageName}/${commandName}`);
    if (!entry) return undefined;
    return { id: entry.id, ...(entry.irOp ? { irOp: entry.irOp } : {}) };
  };
}

/** Reads every bot under `input` and assesses the whole folder as one project. */
export function assessFolder(
  input: string,
  profile: StandardsProfile,
  registry: readonly MappingEntry[],
  generatedAt: string,
): AssessmentResult {
  const { bots, diagnostics } = readFolder(input, lookupFrom(registry));
  return assess({ bots, dependencies: [], diagnostics }, { profile, registry, generatedAt });
}
