import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assess, syntheticProject, syntheticRegistry } from '@rosetta/assessment';
import { loadRegistry, registryDir } from '@rosetta/mappings';
import { renderHtml, renderJson } from '@rosetta/report';
import { ProfileError } from '@rosetta/standards';
import { assessFolder } from './assess-folder.js';
import { ExitCode } from './exit-codes.js';
import { convertCommand } from './convert.js';
import { assessHelp, convertHelp, mainHelp, previewHelp } from './help.js';
import type { Io } from './io.js';
import { parse, resolveProfileFrom, UsageError, version } from './options.js';

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
          topic === 'assess'
            ? assessHelp
            : topic === 'preview-report'
              ? previewHelp
              : topic === 'convert'
                ? convertHelp
                : mainHelp,
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
      case 'convert':
        return convertCommand(rest, io);
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
