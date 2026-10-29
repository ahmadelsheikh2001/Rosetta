import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { assess, syntheticProject, syntheticRegistry } from '@rosetta/assessment';
import { loadRegistry, registryDir } from '@rosetta/mappings';
import { renderHtml, renderJson } from '@rosetta/report';
import { loadProfile, ProfileError, type ResolvedProfile } from '@rosetta/standards';
import { assessFolder } from './assess-folder.js';
import { ExitCode } from './exit-codes.js';
import { assessHelp, mainHelp, previewHelp } from './help.js';
import type { Io } from './io.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const profileOptions = {
  profile: { type: 'string' },
  'client-profile': { type: 'string' },
  overrides: { type: 'string' },
  out: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies ParseArgsConfig['options'];

class UsageError extends Error {}

function parse(args: readonly string[], allowPositionals: boolean) {
  try {
    return parseArgs({ args: [...args], options: profileOptions, allowPositionals, strict: true });
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
}

function resolveProfileFrom(values: ReturnType<typeof parse>['values'], io: Io): ResolvedProfile {
  const abs = (p: string | undefined) => (p === undefined ? undefined : resolve(io.cwd, p));
  const files = {
    company: abs(values.profile),
    client: abs(values['client-profile']),
    project: abs(values.overrides),
  };
  return loadProfile(Object.fromEntries(Object.entries(files).filter(([, v]) => v !== undefined)));
}

function writeReport(dir: string, html: string, json: string, io: Io): void {
  mkdirSync(dir, { recursive: true });
  const htmlPath = join(dir, 'report.html');
  writeFileSync(htmlPath, html);
  writeFileSync(join(dir, 'report.json'), json);
  io.out(`Report written to ${htmlPath}\n`);
}

function previewReport(args: readonly string[], io: Io): number {
  const { values } = parse(args, false);
  if (values.help) {
    io.out(previewHelp);
    return ExitCode.Ok;
  }
  const { profile } = resolveProfileFrom(values, io);
  const result = assess(syntheticProject(), {
    profile,
    registry: syntheticRegistry,
    generatedAt: new Date().toISOString(),
    synthetic: true,
  });
  writeReport(
    resolve(io.cwd, values.out ?? 'out/preview'),
    renderHtml(result),
    renderJson(result),
    io,
  );
  return ExitCode.Ok;
}

function assessCommand(args: readonly string[], io: Io): number {
  const { values, positionals } = parse(args, true);
  if (values.help) {
    io.out(assessHelp);
    return ExitCode.Ok;
  }
  if (positionals.length !== 1) {
    throw new UsageError('assess needs exactly one <input-dir>');
  }
  const input = resolve(io.cwd, positionals[0] ?? '');
  if (!existsSync(input) || !statSync(input).isDirectory()) {
    io.err(`Input folder not found: ${input}\n`);
    return ExitCode.Input;
  }
  const { profile } = resolveProfileFrom(values, io);
  const registry = loadRegistry(registryDir);
  if (registry.problems.length > 0) {
    io.err(
      `Mapping registry is invalid:\n${registry.problems.map((p) => `  - ${p.file}: ${p.message}`).join('\n')}\n`,
    );
    return ExitCode.Internal;
  }

  const result = assessFolder(
    input,
    profile,
    registry.entries.map((e) => e.entry),
    new Date().toISOString(),
  );
  const unreadable = result.diagnostics.filter((d) => d.severity === 'error').length;
  if (result.bots.length === 0) {
    io.err(
      `No A360 bot files found in ${input}${unreadable ? ` (${unreadable} file(s) could not be read)` : ''}.\n`,
    );
    return ExitCode.Input;
  }
  writeReport(
    resolve(io.cwd, values.out ?? 'rosetta-report'),
    renderHtml(result),
    renderJson(result),
    io,
  );
  io.out(
    `Assessed ${result.bots.length} bot(s)${unreadable ? `; ${unreadable} file(s) could not be read` : ''}.\n`,
  );
  return ExitCode.Ok;
}

/**
 * Runs the CLI with `args` (without the node and script paths) and returns the exit code.
 * Never calls `process.exit`, so it can be tested in-process.
 */
export function run(args: readonly string[], io: Io): number {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case undefined:
      case 'help':
      case '-h':
      case '--help': {
        const topic = rest[0];
        io.out(
          topic === 'assess' ? assessHelp : topic === 'preview-report' ? previewHelp : mainHelp,
        );
        return ExitCode.Ok;
      }
      case '-v':
      case '--version':
        io.out(`${version}\n`);
        return ExitCode.Ok;
      case 'assess':
        return assessCommand(rest, io);
      case 'preview-report':
        return previewReport(rest, io);
      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      io.err(`Error: ${err.message}\nRun "rosetta help" for usage.\n`);
      return ExitCode.Usage;
    }
    if (err instanceof ProfileError) {
      io.err(`${err.message}\n`);
      return ExitCode.Config;
    }
    io.err(`Internal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return ExitCode.Internal;
  }
}
