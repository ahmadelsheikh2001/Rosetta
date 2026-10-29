import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { loadProfile, type ResolvedProfile } from '@rosetta/standards';
import type { Io } from './io.js';

/** Shared command-line options and helpers of the commands. */
export const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

export const profileOptions = {
  profile: { type: 'string' },
  'client-profile': { type: 'string' },
  overrides: { type: 'string' },
  out: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies ParseArgsConfig['options'];

export class UsageError extends Error {}

export function parse(args: readonly string[], allowPositionals: boolean) {
  try {
    return parseArgs({ args: [...args], options: profileOptions, allowPositionals, strict: true });
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
}

export function resolveProfileFrom(
  values: ReturnType<typeof parse>['values'],
  io: Io,
): ResolvedProfile {
  const abs = (p: string | undefined) => (p === undefined ? undefined : resolve(io.cwd, p));
  const files = {
    company: abs(values.profile),
    client: abs(values['client-profile']),
    project: abs(values.overrides),
  };
  return loadProfile(Object.fromEntries(Object.entries(files).filter(([, v]) => v !== undefined)));
}
