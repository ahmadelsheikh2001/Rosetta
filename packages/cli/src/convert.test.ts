import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProfile } from '@rosetta/standards';
import { afterAll, describe, expect, it } from 'vitest';
import { checkWal } from '@rosetta/target-wal';
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

  it('writes only commands documented for IBM RPA 30.0.x and present in the Studio toolbox', () => {
    // docs/mappings/a360-to-ibm-rpa.md lists each command with its IBM documentation page
    const known = new Set([
      'defVar',
      'setVar',
      'add',
      'strDictAdd',
      'evaluate',
      'incrementVar',
      'convertNumberToText',
      'convertStringToNumber',
      'messageBox',
      'writeToFile',
      'trimString',
      'getSubString',
      'replaceText',
      'splitString',
      'changeTextCase',
      'getStringLength',
      'parseText',
      'getCurrentDateAndTime',
      'addToDateTime',
      'dateTimeToText',
      'getEnvVar',
      'get',
      'strDictGet',
      'readCSV',
      'if',
      'elseIf',
      'else',
      'endIf',
      'for',
      'next',
      'while',
      'endWhile',
      'do',
      'loopWhile',
      'foreach',
      'endFor',
      'break',
      'continue',
      'failTest',
      'goSub',
      'beginSub',
      'endSub',
      'return',
      'onError',
      'recover',
      'excelOpen',
      'excelSet',
      'excelGetTable',
      'excelClose',
      'mapTableRow',
      'getVaultItem',
      'executeScript',
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

  it('declares every variable before the first command (round 2)', () => {
    for (const b of bots) {
      const commands = b.script.text.split('\r\n').filter((l) => l !== '' && !l.startsWith('//'));
      const firstCommand = commands.findIndex((l) => !l.startsWith('defVar '));
      const lastDefVar = commands.map((l) => l.startsWith('defVar ')).lastIndexOf(true);
      expect(lastDefVar, b.name).toBeLessThan(firstCommand === -1 ? Infinity : firstCommand);
    }
  });

  it('writes nothing between or after subroutine blocks (round 3: blocks must be at the bottom)', () => {
    for (const b of bots) {
      const lines = b.script.text.split('\r\n').filter((l) => l !== '');
      const first = lines.findIndex((l) => l.startsWith('beginSub '));
      if (first === -1) continue;
      let inside = false;
      for (const line of lines.slice(first)) {
        if (line.startsWith('beginSub ')) inside = true;
        else if (!inside) expect.fail(`${b.name}: "${line}" is outside a subroutine block`);
        if (line === 'endSub') inside = false;
      }
    }
  });

  it('passes the static check: no problems in any converted bot', () => {
    for (const b of bots) expect(b.problems, b.name).toEqual([]);
  });

  it('static check finds every error Studio reported in round 1', () => {
    const tested = fileURLToPath(
      new URL(
        '../../../corpus/ibm/probe-30.0.2/round-1/04-error-handling.tested.wal',
        import.meta.url,
      ),
    );
    const lines = new Set(checkWal(readFileSync(tested, 'utf8')).map((p) => p.line));
    // Studio Error List, round 1 (corpus/ibm/probe-30.0.2/round-1/RESULTS.md)
    for (const line of [21, 22, 24, 25, 27, 29, 33, 35, 37])
      expect(lines, `line ${line}`).toContain(line);
  });

  it('never reads list items or dictionary values with brackets (round 4: not interpolated)', () => {
    for (const b of bots) {
      for (const line of b.script.text.split('\r\n')) {
        if (line.startsWith('//')) continue;
        expect(line, b.name).not.toMatch(/\$\{[A-Za-z_]\w*\[/);
      }
    }
  });

  it('uses option values Studio accepts (round 2: conversiontype "Number" rejected)', () => {
    for (const b of bots) expect(b.script.text, b.name).not.toContain('--conversiontype "Number"');
  });

  it('writes no unescaped backslash in a quoted value (round 1: backslash escapes)', () => {
    for (const b of bots) {
      for (const line of b.script.text.split('\r\n')) {
        if (line.startsWith('//')) continue;
        for (const [, value = ''] of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
          // allowed escapes: \\ (backslash), \" (quote), \r and \n (documented line breaks)
          expect(value.replace(/\\[\\"rn]/g, ''), `${b.name}: ${line}`).not.toContain('\\');
        }
      }
    }
  });

  it('writes number values without quotes (round 1: "Not a number")', () => {
    const text = bots.find((b) => b.name === '04-error-handling')?.script.text ?? '';
    expect(text).toContain('--value ${rpa:errorLineNumber}');
    expect(text).not.toContain('--value "${rpa:errorLineNumber}"');
  });

  it('converts the nested Try/Catch/Finally of sample 04 to onError subroutines', () => {
    const lines = (bots.find((b) => b.name === '04-error-handling')?.script.text ?? '').split(
      '\r\n',
    );
    // the catch bodies only run inside their handlers
    for (const l of lines.filter((x) => x.includes('catch:'))) {
      const handler = lines
        .slice(0, lines.indexOf(l))
        .reverse()
        .find((x) => x.startsWith('beginSub'));
      expect(handler).toMatch(/^beginSub --name Catch\d$/);
    }
    // Finally runs in the main flow, after the protected block
    const goSub = lines.indexOf('goSub --label Try1');
    expect(lines.findIndex((x) => x.includes('"cleanup done"'))).toBeGreaterThan(goSub);
    expect(lines.findIndex((x) => x.includes('"cleanup done"'))).toBeLessThan(
      lines.indexOf('beginSub --name Try1'),
    );
    // the inner Try is called from the outer one
    expect(lines.indexOf('goSub --label Try2')).toBeGreaterThan(
      lines.indexOf('beginSub --name Try1'),
    );
  });

  it('converts the Excel row loop of sample 05: one variable per column read', () => {
    const lines = (bots.find((b) => b.name === '05-excel')?.script.text ?? '').split('\r\n');
    expect(lines).toContain('defVar --name vRow_Name --type String');
    expect(lines.some((l) => l.startsWith('defVar --name vRow '))).toBe(false);
    const get = lines.findIndex((l) => l.startsWith('excelGetTable '));
    const map = lines.findIndex((l) => l.startsWith('mapTableRow '));
    const log = lines.findIndex((l) => l.startsWith('writeToFile '));
    expect(get).toBeGreaterThan(lines.findIndex((l) => l.startsWith('excelOpen ')));
    expect(lines[get]).toContain('--hasheaders');
    expect(map).toBeGreaterThan(get);
    expect(lines[log]).toContain('"Name=${vRow_Name} Amount=${vRow_Amount}"');
    // A360 saves, then saves again on close: WAL saves once, on close
    expect(lines.filter((l) => l.startsWith('excelClose ')).at(-1)).toMatch(/--save$/);
  });

  it('calls the converted child bot of sample 08 by its script name', () => {
    const parent = bots.find((b) => b.name === 'RR_08_Parent')?.script.text ?? '';
    const child = bots.find((b) => b.name === 'RR_08_Child');
    expect(child?.script.fileName).toBe('RR_08_Child.wal');
    expect(parent).toContain(
      'executeScript --name "RR_08_Child" --parameters "{\\"inName\\":\\"Test User\\"}" --output "{\\"outGreeting\\":\\"${vResult}\\"}"',
    );
    expect(child?.script.text).toContain('defVar --name inName --type String --parameter');
    expect(child?.script.text).toContain('defVar --name outGreeting --type String --output');
  });

  it('reads vault credentials with getVaultItem and never writes a credential value', () => {
    const parent = bots.find((b) => b.name === 'RR_08_Parent')?.script.text ?? '';
    expect(parent).toContain('getVaultItem --name "DummyLogin" vPassword=password');
    expect(parent).toMatch(/defVar --name vPassword --type SecureString\r\n/);
    expect(parent).not.toContain('NotReal123');
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
    expect(out).toContain('Converted 7 bot(s)');
    const files = readdirSync(join(dir, 'wal')).sort();
    expect(files).toContain('CONVERSION.md');
    expect(files).toContain('04-error-handling.wal');
    expect(files).toContain('04-error-handling.notes.md');
    expect(readFileSync(join(dir, 'wal', 'CONVERSION.md'), 'utf8')).toContain('| 01-variables |');
  });
});
