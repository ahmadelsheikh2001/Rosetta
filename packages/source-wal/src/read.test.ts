import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walk, type Statement } from '@rosetta/ir';
import { describe, expect, it } from 'vitest';
import { readWal } from './read.js';
import { parseCommand, unquote } from './tokens.js';
import { walValue } from './values.js';

const read = (text: string) => readWal(text, { file: 't.wal', name: 't' });
const lit = (value: string | number | boolean) => ({ kind: 'literal', value });
const v = (name: string) => ({ kind: 'var', name, path: [] });

describe('tokens', () => {
  it('splits verb, quoted and bare values, flags and outputs', () => {
    const c = parseCommand(
      'replaceText --texttoparse "a \\"b\\" c" --useregex --count 3 out=value',
    );
    expect(c?.verb).toBe('replaceText');
    expect([...(c?.params ?? [])]).toEqual([
      ['texttoparse', '"a \\"b\\" c"'],
      ['useregex', true],
      ['count', '3'],
    ]);
    expect(c?.outputs).toEqual([{ variable: 'out', output: 'value' }]);
  });

  it('rejects an unterminated string and unescapes values', () => {
    expect(parseCommand('setVar --name "x --value 1')).toBeUndefined();
    expect(unquote('"C:\\\\dir\\\\a.txt"')).toBe('C:\\dir\\a.txt');
    expect(unquote('"a\\r\\nb"')).toBe('a\r\nb');
  });
});

describe('values', () => {
  it('reads text, references, templates, numbers and booleans', () => {
    expect(walValue('"Hello"')).toEqual(lit('Hello'));
    expect(walValue('"${name}"')).toEqual(v('name'));
    expect(walValue('${name}')).toEqual(v('name'));
    expect(walValue('"Hi ${name}!"')).toEqual({
      kind: 'template',
      parts: [lit('Hi '), v('name'), lit('!')],
    });
    expect(walValue('5')).toEqual(lit(5));
    expect(walValue('"5"')).toEqual(lit('5')); // quoted number is text (round 1)
    expect(walValue('False')).toEqual(lit(false));
    expect(walValue('${rpa:errorMessage}')).toEqual({
      kind: 'system',
      name: 'ibm-rpa:errorMessage',
    });
  });

  it('turns 1-based list items into 0-based IR indexes and keeps properties', () => {
    expect(walValue('${list[1]}')).toEqual({
      kind: 'var',
      name: 'list',
      path: [{ kind: 'index', index: lit(0) }],
    });
    expect(walValue('${table.Rows}')).toEqual({
      kind: 'var',
      name: 'table',
      path: [{ kind: 'key', key: lit('Rows') }],
    });
  });
});

describe('readWal', () => {
  it('declares variables with types, defaults and directions', () => {
    const { bot, diagnostics } = read(
      [
        'defVar --name s --type String --value "a" --parameter',
        'defVar --name n --type Numeric --value 12 --output',
        'defVar --name l --type List --innertype String --value "[x,y]"',
        'defVar --name p --type SecureString',
        'defVar --name z --type Hologram',
      ].join('\r\n'),
    );
    const byName = Object.fromEntries(bot.variables.map((x) => [x.name, x]));
    expect(byName.s).toMatchObject({
      type: { kind: 'string' },
      direction: 'input',
      defaultValue: lit('a'),
    });
    expect(byName.n).toMatchObject({
      type: { kind: 'number' },
      direction: 'output',
      defaultValue: lit(12),
    });
    expect(byName.l?.defaultValue).toEqual({
      kind: 'call',
      fn: 'list.of',
      args: [lit('x'), lit('y')],
    });
    expect(byName.p).toMatchObject({ type: { kind: 'credential' }, sensitive: true });
    expect(diagnostics.map((d) => d.code)).toEqual(['WAL-VARIABLE-TYPE']);
  });

  it('reads if / elseIf / else and loop blocks', () => {
    const { bot } = read(
      [
        'if --left "${a}" --operator "Greater_Than" --right 5',
        'logMessage --message "big" --type "Info"',
        'elseIf --left "${ok}" --operator "Is_True" --negate',
        'break',
        'else',
        'continue',
        'endIf',
        'for --variable ${i} --from 1 --to 3 --step 1',
        'next',
        'foreach --collection "${items}" --variable "${item}"',
        'endFor',
        'do',
        'loopWhile --left "${i}" --operator "Less_Than" --right 3',
      ].join('\n'),
    );
    const [ifs, forLoop, each, doLoop] = bot.body;
    expect(ifs).toMatchObject({
      kind: 'if',
      branches: [
        { condition: { kind: 'binary', op: 'gt', left: v('a'), right: lit(5) } },
        {
          condition: { kind: 'binary', op: 'eq', left: v('ok'), right: lit(false) },
          body: [{ kind: 'break' }],
        },
      ],
      else: [{ kind: 'continue' }],
    });
    expect(forLoop).toMatchObject({
      kind: 'loop',
      loop: { kind: 'times', count: lit(3), indexVar: v('i') },
    });
    expect(each).toMatchObject({
      loop: { kind: 'forEach', collection: 'list', itemVar: v('item') },
    });
    expect(doLoop).toMatchObject({ loop: { kind: 'while', checkAtEnd: true } });
  });

  it('keeps commands as actions with their parameters and outputs', () => {
    const { bot } = read('trimString --text "${raw}" --trimoption "TrimStartAndEnd" out=value');
    expect(bot.body[0]).toMatchObject({
      kind: 'action',
      op: 'vendor:ibm-rpa/trimString',
      args: { text: v('raw'), trimoption: lit('TrimStartAndEnd') },
      outputs: { value: v('out') },
      source: { platform: 'ibm-rpa', nodePath: [0], label: 'trimString @ line 1' },
    });
  });

  it('uses the registry op when the lookup knows the verb', () => {
    const { bot } = readWal('trimString --text "a"', {
      file: 't.wal',
      name: 't',
      lookup: (verb) =>
        verb === 'trimString' ? { id: 'ibm.trimstring', irOp: 'string.trim' } : undefined,
    });
    expect(bot.body[0]).toMatchObject({ op: 'string.trim', mappingId: 'ibm.trimstring' });
  });

  it('inlines subroutines where they are called and skips the RPA Rosetta banner', () => {
    const { bot } = read(
      [
        '// ======',
        '// Bot:         x',
        '// a real comment',
        'goSub --label Greet',
        'beginSub --name Greet',
        'logMessage --message "hi" --type "Info"',
        'endSub',
      ].join('\n'),
    );
    expect(bot.body.map((s) => s.kind)).toEqual(['comment', 'group']);
    expect(bot.body[1]).toMatchObject({ label: 'Subroutine Greet', body: [{ kind: 'action' }] });
  });

  it('reads the onError subroutines of ADR-020 back as Try / Catch / Finally', () => {
    const { bot, diagnostics } = read(
      [
        'setVar --name "${rosettaTry1Failed}" --value False',
        'goSub --label Try1',
        '// A360 Finally: runs after the protected block, with or without an error',
        'logMessage --message "cleanup" --type "Info"',
        '// A360 Finally end',
        'logMessage --message "after" --type "Info"',
        'beginSub --name Try1',
        '// A360 Try (ErrorHandler/try @ 1)',
        'onError --label Catch1',
        'failTest --message "boom"',
        'if --left "${rosettaTry1Failed}" --operator "Is_True"',
        'return',
        'endIf',
        'endSub',
        'beginSub --name Catch1',
        '// A360 Catch (BotException)',
        'setVar --name "${rosettaTry1Failed}" --value True',
        'setVar --name "${vErr}" --value "${rpa:errorMessage}"',
        'setVar --name "${vLine}" --value ${rpa:errorLineNumber}',
        'logMessage --message "${vErr}" --type "Info"',
        'recover',
        'endSub',
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
    expect(bot.body.map((s) => s.kind)).toEqual(['try', 'action']);
    expect(bot.body[0]).toMatchObject({
      kind: 'try',
      body: [{ kind: 'throw', message: lit('boom') }],
      catches: [
        {
          errorType: 'BotException',
          errorVar: v('vErr'),
          lineVar: v('vLine'),
          body: [{ kind: 'action', args: { message: v('vErr') } }],
        },
      ],
      finally: [{ kind: 'action', args: { message: lit('cleanup') } }],
    });
  });

  it('reads the Excel table loop of target-wal back as a loop over the session rows', () => {
    const { bot } = read(
      [
        '// vRow (A360 Record): one String variable per column the bot reads',
        'defVar --name vRow_Name --type String',
        'defVar --name rosettaExcelDefault --type Excel',
        'defVar --name rosettaTable1 --type DataTable',
        'defVar --name rosettaRows2 --type Numeric',
        'defVar --name rosettaIndex3 --type Numeric',
        'excelOpen --file "C:\\\\in.xlsx" rosettaExcelDefault=value',
        'excelGetTable --file ${rosettaExcelDefault} --getfirstsheet --entiretable --hasheaders rosettaTable1=value rosettaRows2=rows',
        'for --variable ${rosettaIndex3} --from 1 --to ${rosettaRows2} --step 1',
        'mapTableRow --dataTable ${rosettaTable1} --row ${rosettaIndex3} --mappings "name=Name=${vRow_Name}"',
        'logMessage --message "${vRow_Name}" --type "Info"',
        'next',
        '// A360 Save workbook: WAL saves the workbook when it is closed (excelClose --save)',
        'excelClose --file ${rosettaExcelDefault} --save',
      ].join('\n'),
    );
    expect(bot.variables.map((x) => x.name)).not.toContain('vRow_Name');
    expect(bot.variables.find((x) => x.name === 'vRow')?.type).toEqual({ kind: 'record' });
    expect(bot.body).toMatchObject([
      { kind: 'action', op: 'vendor:ibm-rpa/excelOpen', args: { hasheaders: lit(true) } },
      {
        kind: 'loop',
        loop: {
          kind: 'forEach',
          collection: 'tableRow',
          source: { kind: 'call', fn: 'excel.rows', args: [lit('Default')] },
          itemVar: v('vRow'),
        },
        body: [
          {
            args: {
              message: { kind: 'var', name: 'vRow', path: [{ kind: 'key', key: lit('Name') }] },
            },
          },
        ],
      },
      { kind: 'action', op: 'vendor:ibm-rpa/excelSave' },
      { kind: 'action', op: 'vendor:ibm-rpa/excelClose' },
    ]);
  });

  it('reports what it cannot read instead of failing', () => {
    const { bot, diagnostics } = read('setVar --name "x --value 1\nonError --label Catch1');
    expect(bot.body.map((s) => s.kind)).toEqual(['unknown', 'unknown']);
    expect(diagnostics.map((d) => d.code)).toEqual(['WAL-PARSE', 'WAL-UNSUPPORTED']);
  });
});

describe('the converted corpus (packages/cli/golden/wal)', () => {
  const dir = fileURLToPath(new URL('../../cli/golden/wal/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.wal'));

  it.each(files)('reads %s without parse errors', async (f) => {
    const { bot, diagnostics } = readWal(readFileSync(dir + f, 'utf8'), {
      file: f,
      name: f.replace(/\.wal$/, ''),
    });
    expect(diagnostics.filter((d) => d.code === 'WAL-PARSE')).toEqual([]);
    const unknown: Statement[] = [];
    walk(bot.body, (s) => {
      if (s.kind === 'unknown') unknown.push(s);
    });
    // only the A360 Try/Catch pattern (onError / return) is not rebuilt yet
    expect(
      unknown.every((s) => /^(onError|return)\b/.test(String((s as { raw: unknown }).raw))),
    ).toBe(true);
    await expect(`${JSON.stringify(bot, null, 2)}\n`).toMatchFileSnapshot(
      `../golden/${f.replace(/\.wal$/, '')}.ir.json`,
    );
  });
});
