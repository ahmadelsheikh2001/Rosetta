import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExitCode } from './exit-codes.js';
import { run } from './run.js';

let dir: string;
let out: string;
let err: string;
const io = () => ({
  out: (t: string) => (out += t),
  err: (t: string) => (err += t),
  cwd: dir,
});
const cli = (...args: string[]) => run(args, io());

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rosetta-cli-'));
  out = '';
  err = '';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('rosetta', () => {
  it('prints help with no arguments and for help topics', () => {
    expect(cli()).toBe(ExitCode.Ok);
    expect(out).toContain('Usage:');
    out = '';
    expect(cli('help', 'assess')).toBe(ExitCode.Ok);
    expect(out).toContain('rosetta assess <input-dir>');
  });

  it('prints the version', () => {
    expect(cli('--version')).toBe(ExitCode.Ok);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects unknown commands and options with a usage error', () => {
    expect(cli('convert')).toBe(ExitCode.Usage);
    expect(err).toContain('unknown command "convert"');
    expect(cli('assess', 'x', '--bogus')).toBe(ExitCode.Usage);
  });
});

describe('rosetta assess', () => {
  it('shows its own help', () => {
    expect(cli('assess', '--help')).toBe(ExitCode.Ok);
    expect(out).toContain('--client-profile');
  });

  it('needs exactly one input folder', () => {
    expect(cli('assess')).toBe(ExitCode.Usage);
    expect(cli('assess', 'a', 'b')).toBe(ExitCode.Usage);
  });

  it('reports a missing input folder', () => {
    expect(cli('assess', 'missing')).toBe(ExitCode.Input);
    expect(err).toContain('Input folder not found');
  });

  it('reports an invalid profile with the layer and file', () => {
    mkdirSync(join(dir, 'exports'));
    writeFileSync(join(dir, 'company.yaml'), 'logging:\n  format: 42\n');
    expect(cli('assess', 'exports', '--profile', 'company.yaml')).toBe(ExitCode.Config);
    expect(err).toMatch(/company profile .*company\.yaml.* at "logging\.format"/);
  });

  it('validates inputs, then stops at the parser stub', () => {
    mkdirSync(join(dir, 'exports'));
    expect(cli('assess', 'exports')).toBe(ExitCode.NotImplemented);
    expect(err).toContain('not available yet');
  });
});

describe('rosetta preview-report', () => {
  it('writes a synthetic HTML and JSON report', () => {
    expect(cli('preview-report', '--out', 'preview')).toBe(ExitCode.Ok);
    const html = readFileSync(join(dir, 'preview', 'report.html'), 'utf8');
    expect(html).toContain('<strong>Synthetic data</strong>');
    expect(JSON.parse(readFileSync(join(dir, 'preview', 'report.json'), 'utf8'))).toMatchObject({
      synthetic: true,
    });
    expect(out).toContain('report.html');
  });

  it('applies profile layers to the preview', () => {
    writeFileSync(join(dir, 'company.yaml'), 'sizing:\n  calibrated: true\n');
    expect(cli('preview-report', '--out', 'p', '--profile', 'company.yaml')).toBe(ExitCode.Ok);
    const json = JSON.parse(readFileSync(join(dir, 'p', 'report.json'), 'utf8')) as {
      portfolio: { effort: { calibrated: boolean } };
    };
    expect(json.portfolio.effort.calibrated).toBe(true);
  });

  it('does not write anything when the profile is invalid', () => {
    writeFileSync(join(dir, 'bad.yaml'), 'nope: 1\n');
    expect(cli('preview-report', '--out', 'x', '--profile', 'bad.yaml')).toBe(ExitCode.Config);
    expect(existsSync(join(dir, 'x'))).toBe(false);
  });
});
