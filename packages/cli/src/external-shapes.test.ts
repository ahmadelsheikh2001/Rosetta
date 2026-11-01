import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixturesDir, loadRegistry, registryDir } from '@rosetta/mappings';
import { readBotJson } from '@rosetta/source-a360';
import { defaultProfile } from '@rosetta/standards';
import { checkWal, lowerBot } from '@rosetta/target-wal';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { lookupFrom } from './assess-folder.js';

/**
 * Commands seen in external A360 exports (A-25), written as WAL. The nodes are the registry
 * fixtures: the exports' attribute shapes with synthetic values.
 */
const node = (id: string) =>
  (parse(readFileSync(join(fixturesDir, `${id}.yaml`), 'utf8')) as { node: unknown }).node;
const setCell = (cell: string, value: string) => ({
  uid: `00000000-0000-4000-a000-0000000001${cell.length}${cell.charCodeAt(0)}`,
  disabled: false,
  commandName: 'SetCell',
  packageName: 'Excel_MS',
  attributes: [
    { name: 'cellOption', value: { type: 'STRING', string: 'SPECIFIC_CELL' } },
    { name: 'cell', value: { type: 'STRING', string: cell } },
    { name: 'value', value: { type: 'STRING', string: value } },
    {
      name: 'session',
      value: { type: 'SESSION', sessionName: { type: 'STRING', string: 'Default' } },
    },
  ],
});

function lower(nodes: unknown[]) {
  const { bot } = readBotJson(
    JSON.stringify({ nodes, variables: [{ name: 'vRow', type: 'NUMBER' }] }),
    {
      file: 'x.json',
      name: 'x',
      lookup: lookupFrom(loadRegistry(registryDir).entries.map((e) => e.entry)),
    },
  );
  if (!bot) throw new Error('not read');
  const script = lowerBot(bot, { profile: defaultProfile, generatedAt: 'x', rosettaVersion: 'x' });
  const body = script.text
    .split('\r\n')
    .filter((l) => !l.startsWith('defVar') && !l.startsWith('//') && l !== '');
  return { body, problems: checkWal(script.text), text: script.text };
}

describe('commands from external A360 exports (A-25)', () => {
  it('creates a workbook, adds and switches sheets, and writes to the chosen sheet', () => {
    const { body, problems } = lower([
      node('a360.excelms.createspreadsheet'),
      setCell('A1', 'Name'),
      node('a360.excelms.createworksheet'),
      node('a360.excelms.switchtosheet'),
      setCell('B1', 'x'),
    ]);
    expect(problems).toEqual([]);
    expect(body).toEqual([
      'excelOpen --file "C:\\\\RosettaTest\\\\out10\\\\out10.xlsx" rosettaExcelDefault=value',
      'excelSet --value "Name" --file ${rosettaExcelDefault} --sheet "Main" --usingcell --cell "A1"',
      'excelSet --value "" --file ${rosettaExcelDefault} --sheet "Excluded" --usingcell --cell "A1"',
      'excelSet --value "x" --file ${rosettaExcelDefault} --sheet "Main" --usingcell --cell "B1"',
    ]);
  });

  it('writes delay, decrement, folder and file commands', () => {
    const { body, problems } = lower([
      node('a360.delay.delay'),
      node('a360.number.decrement'),
      node('a360.folder.createfolder'),
      node('a360.file.createfile'),
    ]);
    expect(problems).toEqual([]);
    expect(body).toEqual([
      'delay --timeout 00:00:05',
      'evaluate --expression "${vRow} - 1" vRow=value',
      'createDir --path "C:\\\\RosettaTest\\\\out10"',
      'writeToFile --value "" --file "C:\\\\RosettaTest\\\\out10\\\\note.txt" --overwrite',
    ]);
  });
});
