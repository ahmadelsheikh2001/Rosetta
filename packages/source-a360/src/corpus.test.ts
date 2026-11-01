import { fileURLToPath } from 'node:url';
import { walk, type Bot, type Statement } from '@rosetta/ir';
import { describe, expect, it } from 'vitest';
import { readFolder } from './folder.js';

/** Golden tests over the real corpus (ADR-017): every sample bot must lift cleanly. */
const corpus = fileURLToPath(new URL('../../../corpus/a360', import.meta.url));
const { bots, diagnostics } = readFolder(corpus);
const byName = (name: string): Bot => {
  const found = bots.find((b) => b.name === name);
  if (!found) throw new Error(`missing bot ${name}`);
  return found;
};
const all = (bot: Bot): Statement[] => {
  const list: Statement[] = [];
  walk(bot.body, (s) => list.push(s));
  return list;
};
const ofKind = <K extends Statement['kind']>(bot: Bot, kind: K) =>
  all(bot).filter((s): s is Extract<Statement, { kind: K }> => s.kind === kind);

describe('corpus', () => {
  it('reads every sample bot', () => {
    expect(bots.map((b) => b.name)).toEqual([
      '01-variables',
      '02-control-flow',
      '03-strings-expressions',
      '04-error-handling',
      '05-excel',
      'RR_08_Child',
      'RR_08_Parent',
      '09-web-form',
      '11-missing',
    ]);
  });

  it('has no reading errors and no unparsed expressions or unknown nodes', () => {
    expect(diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    for (const bot of bots) {
      expect(ofKind(bot, 'unknown')).toEqual([]);
      expect(JSON.stringify(bot)).not.toContain('"kind":"raw"');
    }
  });

  it.each(bots.map((b) => [b.name, b] as const))(
    'matches the golden IR for %s',
    async (name, bot) => {
      await expect(`${JSON.stringify(bot, null, 2)}\n`).toMatchFileSnapshot(
        `../golden/${name}.ir.json`,
      );
    },
  );
});

describe('01-variables', () => {
  const bot = byName('01-variables');

  it('lifts variable types, directions and defaults', () => {
    const v = Object.fromEntries(bot.variables.map((x) => [x.name, x]));
    expect(v.vStr).toMatchObject({ type: { kind: 'string' }, direction: 'input' });
    expect(v.vNum).toMatchObject({
      type: { kind: 'number' },
      direction: 'output',
      defaultValue: { value: 12345 },
    });
    expect(v.vList?.type).toEqual({ kind: 'list', of: { kind: 'string' } });
    expect(v.vDict?.type).toEqual({ kind: 'dict', of: { kind: 'string' } });
    expect(v.vTable?.type).toEqual({ kind: 'table' });
    expect(v.vDate?.defaultValue).toEqual({
      kind: 'literal',
      value: '2026-01-01T09:00:00+02:00[Africa/Cairo]',
    });
  });

  it('marks credentials as sensitive and keeps the insecure literal visible', () => {
    const cred = bot.variables.find((x) => x.name === 'vCred');
    expect(cred).toMatchObject({ type: { kind: 'credential' }, sensitive: true });
    expect(cred?.defaultValue).toEqual({ kind: 'literal', value: 'DUMMY_TEST_VALUE' });
  });

  it('keeps Steps, Comments and the disabled command', () => {
    expect(ofKind(bot, 'group').map((g) => g.label)).toEqual([
      'Assign new values',
      'Show and log values',
    ]);
    expect(ofKind(bot, 'comment')).toHaveLength(2);
    expect(
      all(bot)
        .filter((s) => s.disabled)
        .map((s) => s.kind),
    ).toEqual(['action']);
  });

  it('lifts actions as vendor ops with arguments and outputs', () => {
    const assign = ofKind(bot, 'action')[0];
    expect(assign).toMatchObject({
      op: 'vendor:a360/String/assign',
      args: { sourceString: { kind: 'literal', value: 'Updated Test User' } },
      outputs: { result: { kind: 'var', name: 'vStr' } },
    });
  });

  it('resolves lower-cased VARIABLEMAP names to the declared variables', () => {
    const logVars = ofKind(bot, 'action').find((a) => a.op.endsWith('logVariablesToFile'));
    expect(logVars?.args.variables).toEqual({
      kind: 'call',
      fn: 'list.of',
      args: ['vBool', 'vDate', 'vNum', 'vStr'].map((name) => ({ kind: 'var', name, path: [] })),
    });
  });

  it('parses expressions with inline conversions', () => {
    const box = ofKind(bot, 'action').find((a) => a.op === 'vendor:a360/MessageBox/messageBox');
    expect(JSON.stringify(box?.args.content)).toContain('"fn":"convert.toString"');
  });
});

describe('02-control-flow', () => {
  const bot = byName('02-control-flow');

  it('lifts If / Else If / Else from branches', () => {
    const outer = ofKind(bot, 'if')[0];
    expect(outer?.branches).toHaveLength(2);
    expect(outer?.branches[0]?.condition).toMatchObject({
      kind: 'binary',
      op: 'gt',
      right: { value: 5 },
    });
    expect(outer?.branches[1]?.condition).toMatchObject({
      kind: 'binary',
      op: 'eq',
      right: { value: true },
    });
    expect(outer?.else).toHaveLength(1);
  });

  it('lifts every loop kind with its label', () => {
    expect(
      ofKind(bot, 'loop').map(
        (l) =>
          `${l.label ?? ''}:${l.loop.kind}${l.loop.kind === 'forEach' ? `/${l.loop.collection}` : ''}`,
      ),
    ).toEqual([
      'LoopNTimes:times',
      'LoopWhile:while',
      'LoopListItems:forEach/list',
      'LoopDictKeys:forEach/dictKeys',
      'LoopFiles:forEach/file',
    ]);
  });

  it('points break and continue at their loop labels', () => {
    expect(ofKind(bot, 'break')[0]?.target).toBe('LoopNTimes');
    expect(ofKind(bot, 'continue')[0]?.target).toBe('LoopListItems');
  });

  it('parses the nested dictionary key', () => {
    expect(JSON.stringify(bot)).toContain('"kind":"key","key":{"kind":"var","name":"vKey"');
  });
});

describe('04-error-handling', () => {
  const bot = byName('04-error-handling');

  it('lifts nested Try with Catch outputs and Finally', () => {
    const [outer, inner] = ofKind(bot, 'try');
    expect(outer?.catches[0]).toMatchObject({
      errorType: 'BotException',
      errorVar: { name: 'vOuterErr' },
      lineVar: { name: 'vErrLine' },
    });
    expect(outer?.finally).toHaveLength(2);
    expect(inner?.catches[0]?.errorVar?.name).toBe('vErrMsg');
    expect(inner?.finally).toBeUndefined();
  });

  it('lifts Throw as a system exception', () => {
    expect(ofKind(bot, 'throw')[0]).toMatchObject({
      category: 'system',
      message: { value: 'Custom RR_04 error thrown on purpose' },
    });
  });

  it('keeps the file URI expression', () => {
    const open = ofKind(bot, 'action').find((a) => a.op.endsWith('OpenCSVTXT'));
    expect(open?.args.filePath).toEqual({
      kind: 'template',
      parts: [
        { kind: 'literal', value: 'file://' },
        { kind: 'var', name: 'vFilePath', path: [] },
      ],
    });
  });

  it('addresses branch nodes after the children in the node path', () => {
    const [outer] = ofKind(bot, 'try');
    const finallyStmt = outer?.finally?.[0];
    // outer try has 2 children (inner try, if), branches: catch (2), finally (3)
    expect(finallyStmt?.source?.nodePath).toEqual([0, 1, 3, 0]);
  });
});
