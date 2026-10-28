import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { defaultProfile } from './defaults.js';
import { standardsProfile, type StandardsProfile } from './profile.js';

/** Profile layers, lowest precedence first (ADR-008, ADR-009). */
export const layerOrder = ['defaults', 'company', 'client', 'project'] as const;
export type LayerName = (typeof layerOrder)[number];

export interface ProfileLayer {
  readonly name: LayerName;
  /** File path, or `built-in` for the defaults. */
  readonly source: string;
  /** Parsed content; validated only after merging. */
  readonly data: unknown;
}

export interface ProfileIssue {
  readonly layer: LayerName;
  readonly source: string;
  /** Dotted path inside the profile, e.g. `logging.format`; empty for the whole layer. */
  readonly path: string;
  readonly message: string;
}

/** Thrown when layers cannot be merged into a valid profile. `message` is ready for humans. */
export class ProfileError extends Error {
  constructor(readonly issues: readonly ProfileIssue[]) {
    super(
      [
        `Invalid standards profile (${issues.length} problem${issues.length === 1 ? '' : 's'}):`,
        ...issues.map(
          (i) =>
            `  - ${i.layer} profile (${i.source})${i.path ? ` at "${i.path}"` : ''}: ${i.message}`,
        ),
      ].join('\n'),
    );
    this.name = 'ProfileError';
  }
}

export interface ResolvedProfile {
  readonly profile: StandardsProfile;
  /** Which layer set each leaf value, keyed by dotted path. */
  readonly provenance: ReadonlyMap<string, LayerName>;
}

type PlainObject = Record<string, unknown>;

const isPlainObject = (v: unknown): v is PlainObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objects merge key by key; arrays and scalars replace the lower layer's value. */
function mergeInto(
  target: PlainObject,
  source: PlainObject,
  prefix: string,
  layer: ProfileLayer,
  provenance: Map<string, ProfileLayer>,
): void {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const current = target[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      mergeInto(current, value, path, layer, provenance);
      continue;
    }
    for (const known of [...provenance.keys()]) {
      if (known.startsWith(`${path}.`)) provenance.delete(known);
    }
    target[key] = isPlainObject(value) ? structuredClone(value) : value;
    if (isPlainObject(value)) recordLeaves(value, path, layer, provenance);
    else provenance.set(path, layer);
  }
}

function recordLeaves(
  obj: PlainObject,
  prefix: string,
  layer: ProfileLayer,
  provenance: Map<string, ProfileLayer>,
): void {
  if (Object.keys(obj).length === 0) provenance.set(prefix, layer); // so `typo: {}` can be blamed
  for (const [key, value] of Object.entries(obj)) {
    const path = `${prefix}.${key}`;
    if (isPlainObject(value)) recordLeaves(value, path, layer, provenance);
    else provenance.set(path, layer);
  }
}

/**
 * Merges profile layers in order and validates the result.
 * The built-in defaults are always the base; pass only the layers that exist.
 * @throws {ProfileError} listing every problem with the layer and file that caused it.
 */
export function resolveProfile(layers: readonly ProfileLayer[]): ResolvedProfile {
  const base: ProfileLayer = { name: 'defaults', source: 'built-in', data: defaultProfile };
  const ordered = [base, ...layers].sort(
    (a, b) => layerOrder.indexOf(a.name) - layerOrder.indexOf(b.name),
  );

  const merged: PlainObject = {};
  const provenance = new Map<string, ProfileLayer>();
  const issues: ProfileIssue[] = [];

  for (const layer of ordered) {
    if (layer.data === null || layer.data === undefined) continue; // empty file
    if (!isPlainObject(layer.data)) {
      issues.push({
        layer: layer.name,
        source: layer.source,
        path: '',
        message: 'must be a mapping of profile sections (got a list or a single value)',
      });
      continue;
    }
    mergeInto(merged, layer.data, '', layer, provenance);
  }

  const blame = (path: string): ProfileLayer => {
    const exact = provenance.get(path);
    if (exact) return exact;
    // A problem with a whole object is blamed on the highest-precedence layer that touched it.
    let found: ProfileLayer | undefined;
    for (const [key, layer] of provenance) {
      if (!key.startsWith(`${path}.`)) continue;
      if (!found || layerOrder.indexOf(layer.name) > layerOrder.indexOf(found.name)) found = layer;
    }
    return found ?? base;
  };

  const result = standardsProfile.safeParse(merged);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          const keyPath = path ? `${path}.${key}` : key;
          const layer = blame(keyPath);
          issues.push({
            layer: layer.name,
            source: layer.source,
            path: keyPath,
            message: 'unknown setting (check the spelling against docs/standards-profile.md)',
          });
        }
        continue;
      }
      const layer = blame(path);
      issues.push({ layer: layer.name, source: layer.source, path, message: issue.message });
    }
  }

  if (issues.length > 0) throw new ProfileError(issues);
  if (!result.success) throw new ProfileError([]); // unreachable; narrows the type

  return {
    profile: result.data,
    provenance: new Map([...provenance].map(([k, layer]) => [k, layer.name])),
  };
}

/**
 * Project overrides file, `rosetta.project.yaml` (ADR-009). Phase 1 holds only the
 * standards layer; manual conversion decisions are added with the converter.
 */
export const projectFile = z
  .object({
    version: z.literal(1),
    standards: z.unknown().optional(),
  })
  .strict();

function readYaml(name: LayerName, path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new ProfileError([
      { layer: name, source: path, path: '', message: `cannot read file: ${String(err)}` },
    ]);
  }
  try {
    return parse(text) as unknown;
  } catch (err) {
    throw new ProfileError([
      { layer: name, source: path, path: '', message: `invalid YAML: ${String(err)}` },
    ]);
  }
}

export interface ProfileFiles {
  readonly company?: string;
  readonly client?: string;
  /** Path to `rosetta.project.yaml`. */
  readonly project?: string;
}

/** Reads the given YAML files and resolves them on top of the built-in defaults. */
export function loadProfile(files: ProfileFiles): ResolvedProfile {
  const layers: ProfileLayer[] = [];
  if (files.company) {
    layers.push({
      name: 'company',
      source: files.company,
      data: readYaml('company', files.company),
    });
  }
  if (files.client) {
    layers.push({ name: 'client', source: files.client, data: readYaml('client', files.client) });
  }
  if (files.project) {
    const parsed = projectFile.safeParse(readYaml('project', files.project) ?? {});
    if (!parsed.success) {
      throw new ProfileError(
        parsed.error.issues.map((i) => ({
          layer: 'project',
          source: files.project ?? '',
          path: i.code === 'unrecognized_keys' ? i.keys.join(', ') : i.path.join('.'),
          message:
            i.code === 'unrecognized_keys'
              ? 'unknown top-level key (allowed: version, standards)'
              : i.message,
        })),
      );
    }
    layers.push({ name: 'project', source: files.project, data: parsed.data.standards });
  }
  return resolveProfile(layers);
}
