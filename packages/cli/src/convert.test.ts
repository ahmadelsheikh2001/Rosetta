import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProfile } from '@rosetta/standards';
import { afterAll, describe, expect, it } from 'vitest';
import { convertFolder } from './convert.js';
import { ExitCode } from './exit-codes.js';
import { run } from './run.js';

const corpus = fileURLToPath(new URL('../../../corpus/a360', import.meta.url));
const { bots } = convertFolder(corpus, defaultProfile, '2026-10-29T00:00:00.000Z');

describe('conversion of the real corpus', () => {
  it.each(bots.map((b) => [b.name, b] as const))(
    'matches the golden WAL for %s',
    async (name, b) => {
      await expect(b.script.text).toMatchFileSnapshot(`../golden/wal/${name}.wal`);
    },
  );

  it('never writes the hardcoded credential from sample 01', () => {
    for (const b of bots) expect(b.script.text).not.toContain('DUMMY_TEST_VALUE');
  });

  it('writes only known draft commands outside comments', () => {
    const known = new Set([
      'defVar',
      'setVar',
      'add',
      'evaluate',
      'messageBox',
      'writeToFile',
      'trimString',
      'getSubString',
      'replaceText',
      'splitString',
      'toUpper',
      'toLower',
      'getStringLength',
      'getCurrentDateAndTime',
      'readCSV',
      'if',
      'elseIf',
      'else',
      'endIf',
      'for',
      'next',
      'while',
      'endWhile',
      'foreach',
      'endFor',
      'break',
      'continue',
      'failTest',
    ]);
    for (const b of bots) {
      for (const line of b.script.text.split('\r\n')) {
        if (line === '' || line.startsWith('//')) continue;
        expect(known, `${b.name}: ${line}`).toContain(line.split(' ')[0]);
      }
    }
  });

  it('never writes commands that Studio 30.0.2 rejected (round 1)', () => {
    const rejected = ['tryCatch', 'catch', 'endTryCatch'];
    for (const b of bots) {
      for (const line of b.script.text.split('\r\n')) {
        if (line.startsWith('//')) continue;
        expect(rejected, `${b.name}: ${line}`).not.toContain(line.split(' ')[0]);
      }
    }
  });

  it('writes no unescaped backslash in a quoted value (round 1: backslash escapes)', () => {
    for (const b of bots) {
      for (const line of b.script.text.split('\r\n')) {
        if (line.startsWith('//')) continue;
        for (const [, value = ''] of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
          expect(value.replace(/\\\\|\\"/g, ''), `${b.name}: ${line}`).not.toContain('\\');
        }
      }
    }
  });

  it('writes number values without quotes (round 1: "Not a number")', () => {
    const text = bots.find((b) => b.name === '04-error-handling')?.script.text ?? '';
    expect(text).toContain('--value ${wdg:error.LineNumber}');
    expect(text).not.toContain('--value "${wdg:error.LineNumber}"');
  });

  it('keeps catch bodies as comments until WAL error handling is known', () => {
    const text = bots.find((b) => b.name === '04-error-handling')?.script.text ?? '';
    const catchLines = text.split('\r\n').filter((l) => l.includes('catch:'));
    expect(catchLines).toHaveLength(2);
    for (const line of catchLines) expect(line.startsWith('//')).toBe(true);
  });

  it('balances every block', () => {
    const pairs: Record<string, string> = {
      if: 'endIf',
      for: 'next',
      while: 'endWhile',
      foreach: 'endFor',
    };
    for (const b of bots) {
      const stack: string[] = [];
      for (const line of b.script.text.split('\r\n')) {
        const cmd = line.split(' ')[0] ?? '';
        if (line.startsWith('//')) continue;
        if (pairs[cmd]) stack.push(pairs[cmd]);
        else if (Object.values(pairs).includes(cmd)) expect(stack.pop(), b.name).toBe(cmd);
      }
      expect(stack, b.name).toEqual([]);
    }
  });
});

describe('rosetta convert', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rosetta-convert-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a script and notes per bot plus a summary', () => {
    let out = '';
    const code = run(['convert', corpus, '--out', 'wal'], {
      out: (t) => (out += t),
      err: () => undefined,
      cwd: dir,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(out).toContain('Converted 4 bot(s)');
    const files = readdirSync(join(dir, 'wal')).sort();
    expect(files).toContain('CONVERSION.md');
    expect(files).toContain('04-error-handling.wal');
    expect(files).toContain('04-error-handling.notes.md');
    expect(readFileSync(join(dir, 'wal', 'CONVERSION.md'), 'utf8')).toContain('| 01-variables |');
  });
});
