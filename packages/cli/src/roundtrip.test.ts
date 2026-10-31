import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadRegistry, registryDir } from '@rosetta/mappings';
import { readFolder } from '@rosetta/source-a360';
import { readWal } from '@rosetta/source-wal';
import { defaultProfile } from '@rosetta/standards';
import { checkA360, generateA360 } from '@rosetta/target-a360';
import { lowerBot } from '@rosetta/target-wal';
import { describe, expect, it } from 'vitest';
import { lookupFrom } from './assess-folder.js';

/**
 * Round trip (ADR-022): A360 original → IR → WAL → IR → A360 again. The command tree of the result
 * is compared with the original; what matches shows both directions agree.
 */
const corpus = fileURLToPath(new URL('../../../corpus/a360', import.meta.url));
const { bots } = readFolder(
  corpus,
  lookupFrom(loadRegistry(registryDir).entries.map((e) => e.entry)),
);

interface A360Node {
  packageName: string;
  commandName: string;
  disabled?: boolean;
  children?: A360Node[];
  branches?: A360Node[];
}
const tree = (nodes: readonly A360Node[]): string[] =>
  nodes.flatMap((n) => [
    `${n.disabled ? '#' : ''}${n.packageName}/${n.commandName}`,
    ...tree(n.children ?? []),
    ...(n.branches ?? []).flatMap((b) => [
      `${b.packageName}/${b.commandName}`,
      ...tree(b.children ?? []),
    ]),
  ]);

const originals: Record<string, string> = {
  '01-variables': '01-variables/bot.json',
  '02-control-flow': '02-control-flow/bot.json',
  '03-strings-expressions': '03-strings-expressions/bot.json',
  '04-error-handling': '04-error-handling/bot.json',
  '05-excel': '05-excel/bot.json',
  RR_08_Child: '08-subbot-credentials/RR_08_Child.json',
};

function roundTrip(name: string) {
  const bot = bots.find((b) => b.name === name);
  if (!bot) throw new Error(`missing ${name}`);
  const wal = lowerBot(bot, {
    profile: defaultProfile,
    generatedAt: 'x',
    rosettaVersion: 'x',
  }).text;
  return generateA360(readWal(wal, { file: `${name}.wal`, name }).bot);
}

describe('round trip A360 → IBM RPA → A360', () => {
  // share of the original command tree found again; the rest is listed in the notes
  const expected: Record<string, number> = {
    '01-variables': 1,
    '02-control-flow': 25 / 27, // the folder loop and its body have no WAL form yet
    '03-strings-expressions': 1,
    '04-error-handling': 16 / 18, // the two CSV commands have no A360 form yet
    '05-excel': 1,
    RR_08_Child: 1,
  };

  it.each(Object.keys(expected))('%s comes back as the original', async (name) => {
    const original = tree(
      (
        JSON.parse(readFileSync(`${corpus}/${originals[name] ?? ''}`, 'utf8')) as {
          nodes: A360Node[];
        }
      ).nodes,
    );
    const result = roundTrip(name);
    const again = tree(result.json.nodes as A360Node[]);
    const left = [...again];
    const matched = original.filter((x) => {
      const i = left.indexOf(x);
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    }).length;
    expect(matched / original.length).toBeGreaterThanOrEqual(expected[name] ?? 1);
    // what the A360 editor and compiler rejected in the import test must not come back
    expect(checkA360(result.json)).toEqual([]);
    await expect(`${JSON.stringify(result.json, null, 2)}\n`).toMatchFileSnapshot(
      `../golden/a360/${name}.json`,
    );
  });

  it('keeps the disabled message box disabled (corpus 01)', () => {
    const again = tree(roundTrip('01-variables').json.nodes as A360Node[]);
    expect(again).toContain('#MessageBox/messageBox');
  });
});
