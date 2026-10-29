import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadRegistry, registryDir } from '@rosetta/mappings';
import { readFolder } from '@rosetta/source-a360';
import type { StandardsProfile } from '@rosetta/standards';
import { lowerBot, renderNotes, type WalScript } from '@rosetta/target-wal';
import { lookupFrom } from './assess-folder.js';
import { ExitCode } from './exit-codes.js';
import { convertHelp } from './help.js';
import type { Io } from './io.js';
import { parse, resolveProfileFrom, UsageError, version } from './options.js';

export interface ConvertedBot {
  readonly name: string;
  readonly script: WalScript;
}

/** Reads every bot under `input` and generates its WAL script. */
export function convertFolder(
  input: string,
  profile: StandardsProfile,
  generatedAt: string,
): { bots: ConvertedBot[]; unreadable: number } {
  const registry = loadRegistry(registryDir).entries.map((e) => e.entry);
  const { bots, diagnostics } = readFolder(input, lookupFrom(registry));
  return {
    bots: bots.map((bot) => ({
      name: bot.name,
      script: lowerBot(bot, { profile, generatedAt, rosettaVersion: version }),
    })),
    unreadable: diagnostics.filter((d) => d.severity === 'error').length,
  };
}

/** Summary table of a conversion run, written as CONVERSION.md. */
export function renderSummary(bots: readonly ConvertedBot[], generatedAt: string): string {
  const count = (b: ConvertedBot, kind: string) =>
    b.script.notes.filter((n) => n.kind === kind).length;
  return [
    '# Conversion summary',
    '',
    `Generated ${generatedAt} by RPA Rosetta ${version}. **The WAL syntax is a DRAFT until verified in IBM RPA Studio 30.0.2.**`,
    '',
    'How to test: open each `.wal` in Studio. If it is rejected, send the line number and the exact error text.',
    'If it opens, run it and compare the result with the A360 bot. Details per bot are in `<bot>.notes.md`.',
    '',
    '| Bot | Script | Lines | Manual | Behaviour | Syntax checks |',
    '| --- | --- | --- | --- | --- | --- |',
    ...bots.map(
      (b) =>
        `| ${b.name} | [${b.script.fileName}](${b.script.fileName}) | ${b.script.text.split('\r\n').length - 1} | ${count(b, 'manual')} | ${count(b, 'semantic')} | ${count(b, 'verify')} |`,
    ),
    '',
  ].join('\n');
}

/** `rosetta convert <input-dir>` */
export function convertCommand(args: readonly string[], io: Io): number {
  const { values, positionals } = parse(args, true);
  if (values.help) {
    io.out(convertHelp);
    return ExitCode.Ok;
  }
  if (positionals.length !== 1) throw new UsageError('convert needs exactly one <input-dir>');
  const input = resolve(io.cwd, positionals[0] ?? '');
  if (!existsSync(input) || !statSync(input).isDirectory()) {
    io.err(`Input folder not found: ${input}\n`);
    return ExitCode.Input;
  }
  const { profile } = resolveProfileFrom(values, io);
  const generatedAt = new Date().toISOString();
  const { bots, unreadable } = convertFolder(input, profile, generatedAt);
  if (bots.length === 0) {
    io.err(`No A360 bot files found in ${input}.\n`);
    return ExitCode.Input;
  }

  const out = resolve(io.cwd, values.out ?? 'rosetta-wal');
  mkdirSync(out, { recursive: true });
  for (const b of bots) {
    writeFileSync(join(out, b.script.fileName), b.script.text);
    writeFileSync(join(out, `${b.name}.notes.md`), renderNotes(b.script.fileName, b.script.notes));
  }
  writeFileSync(join(out, 'CONVERSION.md'), renderSummary(bots, generatedAt));
  io.out(
    `Converted ${bots.length} bot(s) to ${out}${unreadable ? `; ${unreadable} file(s) could not be read` : ''}.\n` +
      'The WAL is a DRAFT: open each script in IBM RPA Studio and report any error with its line number.\n',
  );
  return ExitCode.Ok;
}
