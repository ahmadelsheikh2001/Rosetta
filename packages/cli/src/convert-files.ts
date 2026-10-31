import { assess, type AssessmentResult } from '@rosetta/assessment';
import type { Bot, Diagnostic } from '@rosetta/ir';
import type { MappingEntry } from '@rosetta/mappings';
import { readBotJson } from '@rosetta/source-a360';
import { readWal } from '@rosetta/source-wal';
import type { StandardsProfile } from '@rosetta/standards';
import {
  checkA360,
  generateA360,
  type A360Note,
  type A360Options,
  type A360Problem,
} from '@rosetta/target-a360';
import { checkWal, lowerBot } from '@rosetta/target-wal';
import { lookupFrom } from './assess-folder.js';
import type { ConvertedBot } from './convert.js';
import { version } from './options.js';

/** A bot file held in memory, e.g. uploaded in the web UI. */
export interface InputFile {
  readonly name: string;
  readonly text: string;
}

export interface FilesResult {
  readonly bots: readonly ConvertedBot[];
  /** Reading diagnostics of every file, readable or not. */
  readonly diagnostics: readonly Diagnostic[];
  /** Assessment of the converted bots as one project (report input). */
  readonly assessment: AssessmentResult;
}

/** Bot name of an uploaded file: its name without `.json` or `.wal`. */
export const botName = (file: string): string =>
  file.replace(/^.*[\\/]/, '').replace(/\.(json|wal)$/i, '') || 'bot';

/**
 * Converts A360 bot files held in memory: the same steps as `rosetta convert`
 * (read, lift, lower to WAL, static check) plus the assessment of the set.
 */
export function convertFiles(
  files: readonly InputFile[],
  profile: StandardsProfile,
  registry: readonly MappingEntry[],
  generatedAt: string,
): FilesResult {
  const lookup = lookupFrom(registry);
  const bots: Bot[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const f of files) {
    const result = readBotJson(f.text, { file: f.name, name: botName(f.name), lookup });
    if (result.bot) bots.push(result.bot);
    diagnostics.push(...result.diagnostics);
  }
  const converted = bots.map((bot) => {
    const script = lowerBot(bot, { profile, generatedAt, rosettaVersion: version });
    return { name: bot.name, script, problems: checkWal(script.text) };
  });
  const assessment = assess(
    { bots, dependencies: [], diagnostics },
    { profile, registry, generatedAt },
  );
  return { bots: converted, diagnostics, assessment };
}

/** An A360 task bot generated from a WAL script, with what to check before upload. */
export interface A360File {
  readonly name: string;
  readonly fileName: string;
  /** The task bot JSON, as written back to the Control Room (A-24). */
  readonly text: string;
  readonly notes: readonly A360Note[];
  /** What the A360 editor or compiler would reject; the upload API checks nothing (A-24). */
  readonly problems: readonly A360Problem[];
}

/**
 * Converts IBM RPA WAL scripts held in memory to A360 task bots (ADR-022): read, generate,
 * check. Each script is read on its own; a bot started with executeScript is not followed.
 */
export function convertWalFiles(
  files: readonly InputFile[],
  options: A360Options = {},
): {
  bots: A360File[];
  diagnostics: Diagnostic[];
} {
  const bots: A360File[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const f of files) {
    const name = botName(f.name);
    const read = readWal(f.text, { file: f.name, name });
    diagnostics.push(...read.diagnostics);
    const { json, notes } = generateA360(read.bot, options);
    bots.push({
      name,
      fileName: `${name}.json`,
      text: `${JSON.stringify(json, null, 2)}\n`,
      notes,
      problems: checkA360(json),
    });
  }
  return { bots, diagnostics };
}

/** Notes of a generated A360 bot as Markdown, like `<bot>.notes.md` of the WAL direction. */
export function renderA360Notes(bot: A360File): string {
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const out = [`# ${bot.fileName}: conversion notes`, ''];
  if (bot.problems.length > 0) {
    out.push(
      '## Check problems',
      '',
      'Found before upload: A360 would reject these in the editor or when the bot runs.',
      '',
      '| Where | Problem |',
      '| --- | --- |',
      ...bot.problems.map((p) => `| ${p.at} | ${cell(p.message)} |`),
      '',
    );
  }
  const manual = bot.notes.filter((n) => n.kind === 'manual');
  const semantic = bot.notes.filter((n) => n.kind === 'semantic');
  out.push(`${manual.length} manual, ${semantic.length} behaviour.`, '');
  for (const [title, list] of [
    ['Manual work', manual],
    ['Behaviour differences', semantic],
  ] as const) {
    if (list.length === 0) continue;
    out.push(`## ${title}`, '', '| Note | Source |', '| --- | --- |');
    for (const n of list) out.push(`| ${cell(n.text)} | ${n.source ?? ''} |`);
    out.push('');
  }
  return out.join('\n');
}
