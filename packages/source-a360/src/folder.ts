import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import type { Bot, Diagnostic } from '@rosetta/ir';
import { LiftCode, LiftContext, type MappingLookup } from './context.js';
import { readExportZip } from './export.js';
import { readBotJson } from './read.js';

export interface FolderResult {
  readonly bots: readonly Bot[];
  /** Diagnostics of every file, readable or not. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Reads every A360 bot file under `root`: `*.json` files holding raw bot content.
 * A file named `bot.json` takes its folder's name as bot name, any other file its own name.
 * Export zips are read through their manifest (`readExportZip`): each task bot inside is a bot
 * named after its repository file.
 */
export function readFolder(root: string, lookup?: MappingLookup): FolderResult {
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(sep).join('/'))
    .sort();
  const bots: Bot[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower.endsWith('.zip')) {
      const zip = readExportZip(readFileSync(join(root, file)));
      const ctx = new LiftContext(file, () => undefined);
      for (const problem of zip.problems)
        ctx.report(
          LiftCode.Zip,
          zip.files.length ? 'warning' : 'error',
          { file, problem },
          ctx.ref([]),
        );
      diagnostics.push(...ctx.diagnostics);
      for (const f of zip.files) {
        const result = readBotJson(f.text, {
          file: `${file}!${f.path}`,
          name: f.path.split('/').pop() ?? f.path,
          ...(lookup ? { lookup } : {}),
        });
        if (result.bot) bots.push(result.bot);
        diagnostics.push(...result.diagnostics);
      }
      continue;
    }
    if (!lower.endsWith('.json')) continue;
    const name = basename(file) === 'bot.json' ? basename(dirname(file)) : basename(file, '.json');
    const result = readBotJson(readFileSync(join(root, file), 'utf8'), {
      file: relative('.', file).split(sep).join('/'),
      name: name === '.' ? basename(root) : name,
      ...(lookup ? { lookup } : {}),
    });
    if (result.bot) bots.push(result.bot);
    diagnostics.push(...result.diagnostics);
  }
  return { bots, diagnostics };
}
