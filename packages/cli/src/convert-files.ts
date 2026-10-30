import { assess, type AssessmentResult } from '@rosetta/assessment';
import type { Bot, Diagnostic } from '@rosetta/ir';
import type { MappingEntry } from '@rosetta/mappings';
import { readBotJson } from '@rosetta/source-a360';
import type { StandardsProfile } from '@rosetta/standards';
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

/** Bot name of an uploaded file: its name without `.json`. */
export const botName = (file: string): string =>
  file.replace(/^.*[\\/]/, '').replace(/\.json$/i, '') || 'bot';

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
