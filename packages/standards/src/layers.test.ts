import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultProfile } from './defaults.js';
import { loadProfile, ProfileError, resolveProfile } from './layers.js';

const expectProfileError = (fn: () => unknown): ProfileError => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ProfileError) return err;
    throw err;
  }
  throw new Error('expected a ProfileError');
};

describe('resolveProfile', () => {
  it('returns the built-in defaults when no layer is given', () => {
    expect(resolveProfile([]).profile).toEqual(defaultProfile);
  });

  it('applies an override and records which layer set it', () => {
    const { profile, provenance } = resolveProfile([
      { name: 'company', source: 'company.yaml', data: { logging: { format: '{message}' } } },
    ]);
    expect(profile.logging.format).toBe('{message}');
    expect(profile.logging.stepBoundaries).toBe(true); // untouched sibling kept
    expect(provenance.get('logging.format')).toBe('company');
    expect(provenance.get('logging.stepBoundaries')).toBe('defaults');
  });

  it('lets project beat client beat company, regardless of argument order', () => {
    const hours = (S: number) => ({ sizing: { hoursPerSize: { S } } });
    const { profile, provenance } = resolveProfile([
      { name: 'project', source: 'p.yaml', data: hours(3) },
      { name: 'company', source: 'c.yaml', data: hours(1) },
      { name: 'client', source: 'k.yaml', data: hours(2) },
    ]);
    expect(profile.sizing.hoursPerSize.S).toBe(3);
    expect(profile.sizing.hoursPerSize.M).toBe(defaultProfile.sizing.hoursPerSize.M);
    expect(provenance.get('sizing.hoursPerSize.S')).toBe('project');
  });

  it('replaces lists instead of concatenating them', () => {
    const { profile } = resolveProfile([
      { name: 'client', source: 'k.yaml', data: { header: { fields: ['name', 'sourceRef'] } } },
    ]);
    expect(profile.header.fields).toEqual(['name', 'sourceRef']);
  });

  it('can switch a behavioral transform on only through an explicit layer value', () => {
    const { profile } = resolveProfile([
      { name: 'project', source: 'p.yaml', data: { behavioral: { addRetries: true } } },
    ]);
    expect(profile.behavioral).toEqual({ replaceDelayWithWait: false, addRetries: true });
  });

  it('treats an empty layer file as no change', () => {
    expect(resolveProfile([{ name: 'company', source: 'c.yaml', data: null }]).profile).toEqual(
      defaultProfile,
    );
  });

  it('blames the layer and file that introduced a wrong type', () => {
    const err = expectProfileError(() =>
      resolveProfile([
        { name: 'company', source: 'profiles/company.yaml', data: { logging: { format: 42 } } },
      ]),
    );
    expect(err.issues).toEqual([
      expect.objectContaining({ layer: 'company', path: 'logging.format' }),
    ]);
    expect(err.message).toContain('company profile (profiles/company.yaml) at "logging.format"');
  });

  it('reports misspelled settings with their full path', () => {
    const err = expectProfileError(() =>
      resolveProfile([
        { name: 'client', source: 'bank.yaml', data: { logging: { fromat: 'x' }, logginng: {} } },
      ]),
    );
    expect(err.issues.map((i) => `${i.layer}:${i.path}`).sort()).toEqual([
      'client:logging.fromat',
      'client:logginng',
    ]);
    expect(err.message).toMatch(/unknown setting/);
  });

  it('blames cross-field rule violations on the layer that broke them', () => {
    const err = expectProfileError(() =>
      resolveProfile([
        { name: 'project', source: 'p.yaml', data: { sizing: { thresholds: { M: 10 } } } },
      ]),
    );
    expect(err.issues[0]).toMatchObject({ layer: 'project', path: 'sizing.thresholds' });
  });

  it('rejects a layer that is not a mapping', () => {
    const err = expectProfileError(() =>
      resolveProfile([{ name: 'company', source: 'c.yaml', data: ['a'] }]),
    );
    expect(err.message).toMatch(/must be a mapping/);
  });
});

describe('loadProfile', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rosetta-profile-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const file = (name: string, body: string): string => {
    const path = join(dir, name);
    writeFileSync(path, body);
    return path;
  };

  it('reads company, client and project files', () => {
    const { profile } = loadProfile({
      company: file('company.yaml', 'naming:\n  subroutine:\n    case: snake_case\n'),
      client: file('client.yaml', 'stages:\n  init: Start\n'),
      project: file('rosetta.project.yaml', 'version: 1\nstandards:\n  stages:\n    end: Close\n'),
    });
    expect(profile.naming.subroutine.case).toBe('snake_case');
    expect(profile.stages).toEqual({ init: 'Start', process: 'Processing', end: 'Close' });
  });

  it('reports YAML syntax errors with the file', () => {
    const path = file('company.yaml', 'naming: [unclosed');
    const err = expectProfileError(() => loadProfile({ company: path }));
    expect(err.message).toContain(path);
    expect(err.message).toMatch(/invalid YAML/);
  });

  it('reports a missing file', () => {
    const err = expectProfileError(() => loadProfile({ client: join(dir, 'nope.yaml') }));
    expect(err.issues[0]?.layer).toBe('client');
    expect(err.issues[0]?.message).toMatch(/cannot read/);
  });

  it('validates the project file envelope', () => {
    const path = file('rosetta.project.yaml', 'version: 1\nstandrads: {}\n');
    const err = expectProfileError(() => loadProfile({ project: path }));
    expect(err.message).toMatch(/unknown top-level key/);
  });
});
