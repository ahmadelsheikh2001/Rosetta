import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixturesDir, loadRegistry, registryDir } from '@rosetta/mappings';
import { readBotJson } from '@rosetta/source-a360';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { lookupFrom } from './assess-folder.js';

/**
 * Fixture runner for the mapping registry (ADR-005): every `partial`/`mapped`
 * entry has a real corpus node that must lift to its canonical op. Lives here
 * because it needs both the registry and the A360 reader.
 */
interface Fixture {
  id: string;
  node: unknown;
  expect: { op: string };
}

const lookup = lookupFrom(loadRegistry(registryDir).entries.map((e) => e.entry));
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => parse(readFileSync(join(fixturesDir, f), 'utf8')) as Fixture);

describe('mapping fixtures', () => {
  it('exist', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s lifts to its canonical op', (id, f) => {
    const { bot, diagnostics } = readBotJson(JSON.stringify({ nodes: [f.node], variables: [] }), {
      file: `${id}.json`,
      name: id,
      lookup,
    });
    expect(diagnostics).toEqual([]);
    expect(bot?.body[0]).toMatchObject({ kind: 'action', op: f.expect.op, mappingId: id });
  });
});
