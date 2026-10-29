import { fileURLToPath } from 'node:url';
import { loadRegistry, registryDir } from '@rosetta/mappings';
import { en } from '@rosetta/report';
import { liftMessageIds } from '@rosetta/source-a360';
import { defaultProfile } from '@rosetta/standards';
import { describe, expect, it } from 'vitest';
import { assessFolder } from './assess-folder.js';

const corpus = fileURLToPath(new URL('../../../corpus/a360', import.meta.url));
const registry = loadRegistry(registryDir).entries.map((e) => e.entry);
const result = assessFolder(corpus, defaultProfile, registry, '2026-10-29T00:00:00.000Z');

describe('assessment of the real corpus', () => {
  it('matches the golden assessment', async () => {
    await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
      '../golden/corpus.assessment.json',
    );
  });

  it('links every corpus action to a registry entry', () => {
    const reasons = new Set(result.bots.flatMap((b) => b.conversionItems.map((i) => i.reason)));
    expect(reasons).toEqual(new Set(['planned']));
  });

  it('finds the quality issues built into the samples', () => {
    const codes = (name: string) =>
      result.bots.find((b) => b.name === name)?.quality.findings.map((f) => f.code) ?? [];
    expect(codes('01-variables')).toContain('QUAL-DISABLED-CODE');
    expect(codes('01-variables')).toContain('QUAL-HARDCODED-CREDENTIAL');
    expect(codes('01-variables')).toContain('QUAL-MISSING-ERROR-HANDLING');
    expect(codes('04-error-handling')).not.toContain('QUAL-MISSING-ERROR-HANDLING');
    // A360 template variables SampleNumber / SampleString are never used
    expect(codes('02-control-flow')).toContain('QUAL-UNUSED-VARIABLE');
  });

  it('has a report string for every reading diagnostic', () => {
    for (const id of Object.values(liftMessageIds)) expect(en).toHaveProperty(id);
  });
});
