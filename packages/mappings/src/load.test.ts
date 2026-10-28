import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRegistry } from './load.js';

const valid = `
id: a360.sample.command
source: { platform: a360, package: Sample, command: doThing }
status: mapped
irOp: sample.doThing
`;

describe('loadRegistry', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rosetta-registry-'));
    mkdirSync(join(root, 'a360'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (name: string, body: string): void => {
    writeFileSync(join(root, 'a360', name), body);
  };

  it('loads valid entries with defaults applied', () => {
    write('ok.yaml', valid);
    const { entries, problems } = loadRegistry(root);
    expect(problems).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.file).toBe('a360/ok.yaml');
    expect(entries[0]?.entry.evidence).toEqual([]);
  });

  it('reports schema violations instead of throwing', () => {
    write('bad.yaml', 'id: Not Valid\nstatus: maybe\n');
    const { entries, problems } = loadRegistry(root);
    expect(entries).toEqual([]);
    expect(problems.map((p) => p.message).join('\n')).toMatch(/id|status|source/);
  });

  it('requires irOp for mapped entries', () => {
    write('no-op.yaml', valid.replace('irOp: sample.doThing', ''));
    expect(loadRegistry(root).problems[0]?.message).toMatch(/irOp/);
  });

  it('allows planned entries without irOp', () => {
    write('planned.yaml', valid.replace('status: mapped', 'status: planned').replace(/irOp.*/, ''));
    expect(loadRegistry(root).problems).toEqual([]);
  });

  it('rejects duplicate ids', () => {
    write('a.yaml', valid);
    write('b.yaml', valid);
    expect(loadRegistry(root).problems[0]?.message).toMatch(/duplicate id/);
  });

  it('reports invalid YAML', () => {
    write('broken.yaml', 'id: [unclosed');
    expect(loadRegistry(root).problems[0]?.message).toMatch(/invalid YAML/);
  });
});
