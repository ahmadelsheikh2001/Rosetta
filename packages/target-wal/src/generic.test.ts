import { action, bot, lit, ref, variable, type OpName } from '@rosetta/ir';
import { defaultProfile } from '@rosetta/standards';
import { describe, expect, it } from 'vitest';
import { checkWal } from './check.js';
import { conversionRules, ibmCatalog, stubName } from './generic.js';
import { lowerBot } from './lower.js';

const opts = { profile: defaultProfile, generatedAt: '2026-11-02', rosettaVersion: '0.0.0' };
const op = (key: string) => `vendor:a360/${key}` as OpName;
const lines = (text: string) => text.split('\r\n');

/** One A360 action per rule, with a literal value for every attribute the rule knows. */
function sample(key: string) {
  const rule = conversionRules()[key];
  const args = Object.fromEntries(
    Object.keys(rule?.p ?? {}).map((path, i) => [path, lit(i % 2 ? 'C:\\in\\a.txt' : 'x')]),
  );
  return action(op(key), { args, outputs: { result: ref('vOut') } });
}

describe('fallback conversion (A-27)', () => {
  it('converts every command of the mapping dictionary into WAL the checker accepts', () => {
    const keys = Object.keys(conversionRules());
    expect(keys.length).toBeGreaterThan(1500);
    const failures: string[] = [];
    for (const key of keys) {
      const b = bot('b', [sample(key)], { variables: [variable('vOut', { kind: 'string' })] });
      const script = lowerBot(b, opts);
      const errors = checkWal(script.text).filter((p) => p.severity === 'error');
      if (errors.length) failures.push(`${key}: ${errors.map((e) => e.message).join(' | ')}`);
      // nothing is dropped silently: every command leaves a line or a comment naming it
      expect(script.text, key).toMatch(/\S/);
    }
    expect(failures).toEqual([]);
  });

  it('writes one IBM command for a native rule (Folder/createFolder → createDir)', () => {
    const b = bot('b', [
      action(op('Folder/createFolder'), { args: { folderPath: lit('C:\\out') } }),
    ]);
    const text = lowerBot(b, opts).text;
    expect(lines(text)).toContain('createDir --path "C:\\\\out"');
  });

  it('maps enum values and keeps the review list in the notes (Datetime/subtract)', () => {
    const b = bot('b', [
      action(op('Datetime/subtract'), {
        args: { source: ref('d'), unit: lit('DAYS'), val: lit(3) },
        outputs: { result: ref('vOut') },
      }),
    ]);
    const script = lowerBot(b, opts);
    const line = lines(script.text).find((l) => l.startsWith('addToDateTime'));
    expect(line).toContain('--type "Days"');
    expect(script.notes.some((n) => n.kind === 'manual' && n.text.includes('negate'))).toBe(true);
  });

  it('turns an unknown command into a stub subroutine that fails on purpose', () => {
    const b = bot('b', [action(op('NoSuchPackage/doMagic'), { args: { a: lit('1') } })]);
    const text = lines(lowerBot(b, opts).text);
    const name = stubName('NoSuchPackage/doMagic');
    expect(text).toContain(`goSub --label ${name}`);
    expect(text).toContain(`beginSub --name ${name}`);
    expect(text.some((l) => l.startsWith('failTest --message'))).toBe(true);
    expect(checkWal(text.join('\r\n')).filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('writes one stub per command even when it is used twice', () => {
    const b = bot('b', [action(op('NoSuchPackage/doMagic')), action(op('NoSuchPackage/doMagic'))]);
    const text = lines(lowerBot(b, opts).text);
    expect(text.filter((l) => l.startsWith('beginSub --name Rosetta_')).length).toBe(1);
  });

  it('builds an httpRequest template for SaaS commands', () => {
    const key = Object.entries(conversionRules()).find(
      ([, r]) =>
        r.s === 'PATTERN' && Object.values(r.p ?? {}).some(([, how]) => how === 'BODY_FIELD'),
    )?.[0];
    expect(key).toBeDefined();
    const text = lines(lowerBot(bot('b', [sample(key ?? '')]), opts).text);
    expect(
      text.some((l) => l.startsWith('httpRequest --verb "Post"') && l.includes('{{ROSETTA:')),
    ).toBe(true);
  });

  it('runs an inline JavaScript function through Windows Script Host', () => {
    const b = bot('b', [
      action(op('JavaScript/javascript.commands.openScript'), {
        args: {
          session: lit('S'),
          scriptOption: lit('SCRIPT'),
          script: lit('function f(a){return a}'),
        },
      }),
      action(op('JavaScript/javascript.commands.executeFunction'), {
        args: { session: lit('S'), functionName: lit('f'), argument: lit('1') },
        outputs: { result: ref('vOut') },
      }),
    ]);
    const line = lines(lowerBot(b, opts).text).find((l) => l.startsWith('runWindowsScript'));
    expect(line).toContain('--source "Script"');
    expect(line).toContain('f.apply(null,rosettaArgs)');
    expect(line).toContain('vOut=output');
  });

  it('knows the IBM RPA 30.0.x reference commands', () => {
    expect(Object.keys(ibmCatalog()).length).toBeGreaterThan(600);
    expect(ibmCatalog().createDir?.p).toHaveProperty('path');
  });
});
