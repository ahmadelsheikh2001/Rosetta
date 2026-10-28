import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import { mappingEntry, type MappingEntry } from './entry.js';

export interface LoadedEntry {
  readonly entry: MappingEntry;
  /** Path relative to the registry root, forward slashes. */
  readonly file: string;
}

export interface RegistryProblem {
  readonly file: string;
  readonly message: string;
}

export interface LoadResult {
  readonly entries: readonly LoadedEntry[];
  readonly problems: readonly RegistryProblem[];
}

/** Lists `*.yaml` files under `dir`, sorted for deterministic output. */
export function listYamlFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join(dir, f))
    .sort();
}

/**
 * Loads and validates every registry entry under `root`.
 * Never throws on bad entries; problems are returned so they can all be reported at once.
 */
export function loadRegistry(root: string): LoadResult {
  const entries: LoadedEntry[] = [];
  const problems: RegistryProblem[] = [];
  const seen = new Map<string, string>();

  for (const path of listYamlFiles(root)) {
    const file = relative(root, path).split(sep).join('/');
    let data: unknown;
    try {
      data = parse(readFileSync(path, 'utf8'));
    } catch (err) {
      problems.push({ file, message: `invalid YAML: ${String(err)}` });
      continue;
    }
    const result = mappingEntry.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push({ file, message: `${issue.path.join('.') || '(root)'}: ${issue.message}` });
      }
      continue;
    }
    const previous = seen.get(result.data.id);
    if (previous !== undefined) {
      problems.push({ file, message: `duplicate id "${result.data.id}" (also in ${previous})` });
      continue;
    }
    seen.set(result.data.id, file);
    entries.push({ entry: result.data, file });
  }

  return { entries, problems };
}
