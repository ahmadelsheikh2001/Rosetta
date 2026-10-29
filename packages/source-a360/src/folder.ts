import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import type { Bot, Diagnostic } from '@rosetta/ir';
import { LiftCode, LiftContext, type MappingLookup } from './context.js';
import { readBotJson } from './read.js';

export interface FolderResult {
  readonly bots: readonly Bot[];
  /** Diagnostics of every file, readable or not. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Reads every A360 bot file under `root`: `*.json` files holding raw bot content.
 * A file named `bot.json` takes its folder's name as bot name, any other file its own name.
 * Export zips are reported, not read, until their layout is verified (A-01).
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
      const ctx = new LiftContext(file, () => undefined);
      ctx.report(LiftCode.Zip, 'error', { file }, ctx.ref([]));
      diagnostics.push(...ctx.diagnostics);
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
