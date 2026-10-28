import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { testedStatuses } from './entry.js';
import { loadRegistry } from './load.js';
import { fixturesDir, handlersDir, registryDir } from './paths.js';

/**
 * Meta-test (ADR-005): enforces "every mapping and handler has a test"
 * over the real registry, so coverage cannot grow without tests.
 */
describe('registry meta-test', () => {
  const { entries, problems } = loadRegistry(registryDir);

  it('has no invalid entries', () => {
    expect(problems).toEqual([]);
  });

  it('has a fixture for every partial or mapped entry', () => {
    const missing = entries
      .filter(({ entry }) => testedStatuses.includes(entry.status))
      .map(({ entry }) => entry.id)
      .filter((id) => !existsSync(join(fixturesDir, `${id}.yaml`)));
    expect(missing).toEqual([]);
  });

  const handlerFiles = existsSync(handlersDir)
    ? readdirSync(handlersDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    : [];

  it('has a unit test next to every handler', () => {
    const untested = handlerFiles.filter(
      (f) => !existsSync(join(handlersDir, f.replace(/\.ts$/, '.test.ts'))),
    );
    expect(untested).toEqual([]);
  });

  it('only references handlers that exist', () => {
    const available = new Set(handlerFiles.map((f) => f.replace(/\.ts$/, '')));
    const dangling = entries
      .map(({ entry }) => entry.handler)
      .filter((h): h is string => h !== undefined && !available.has(h));
    expect(dangling).toEqual([]);
  });
});
