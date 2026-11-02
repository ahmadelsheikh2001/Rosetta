import {
  action,
  bot,
  comment,
  group,
  ifThen,
  lit,
  loopTimes,
  ref,
  tryCatch,
  variable,
  type Expr,
} from '@rosetta/ir';
import { defaultProfile } from '@rosetta/standards';
import { describe, expect, it } from 'vitest';
import { pathOf, textOf, valueOf } from './expr.js';
import { lowerBot } from './lower.js';
import { renderNotes } from './notes.js';
import type { NoteInput } from './writer.js';

const opts = { profile: defaultProfile, generatedAt: '2026-10-29', rosettaVersion: '0.0.0' };
const lines = (b: ReturnType<typeof bot>) =>
  lowerBot(b, opts)
    .text.split('\r\n')
    .filter((l) => l !== '' && !l.startsWith('// ='));
const body = (b: ReturnType<typeof bot>) =>
  lines(b).filter((l) => !/^\/\/ (Bot|Source|Converted|Generator|Inputs|Outputs|Status):/.test(l));

describe('expressions', () => {
  const notes: NoteInput[] = [];
  const sink = (n: NoteInput) => notes.push(n);

  it('writes templates with ${} references', () => {
    const e: Expr = { kind: 'template', parts: [lit('Hi '), ref('name'), lit('!')] };
    expect(textOf(e, sink)).toBe('Hi ${name}!');
  });

  it('shifts list indexes to the WAL base and flags it', () => {
    notes.length = 0;
    const e: Expr = { kind: 'var', name: 'l', path: [{ kind: 'index', index: lit(0) }] };
    expect(textOf(e, sink)).toBe('${l[1]}');
    expect(notes[0]).toMatchObject({ kind: 'verify', assumption: 'A-19' });
  });

  it('drops inline toString conversions', () => {
    expect(textOf({ kind: 'call', fn: 'convert.toString', args: [ref('n')] }, sink)).toBe('${n}');
  });

  it('writes a visible placeholder and a manual note for values without a WAL equivalent', () => {
    notes.length = 0;
    expect(textOf({ kind: 'system', name: 'a360:AAControlRoom' }, sink)).toBe(
      '{{ROSETTA: a360:AAControlRoom}}',
    );
    expect(notes[0]?.kind).toBe('manual');
  });

  it('maps A360 system variables that have a documented WAL equivalent', () => {
    expect(textOf({ kind: 'system', name: 'a360:AATaskName' }, sink)).toBe('${rpa:scriptName}');
    expect(textOf({ kind: 'system', name: 'a360:Machine' }, sink)).toBe('${rosettaMachineName}');
  });

  it('keeps numbers and booleans bare, quotes the rest', () => {
    expect(valueOf(lit(5), sink)).toBe('5');
    expect(valueOf(lit(true), sink)).toBe('True');
    expect(valueOf(ref('x'), sink)).toBe('"${x}"');
  });

  it('turns A360 file URIs into Windows paths, with backslashes escaped', () => {
    // WAL: C:\RosettaTest\log.txt must be written C:\\RosettaTest\\log.txt (Studio round 1)
    expect(pathOf(lit('file:///C:/RosettaTest/log.txt'), sink)).toBe(
      String.raw`"C:\\RosettaTest\\log.txt"`,
    );
    expect(pathOf({ kind: 'template', parts: [lit('file://'), ref('p')] }, sink)).toBe('"${p}"');
  });
});

describe('lowerBot', () => {
  it('declares variables with direction flags', () => {
    const b = bot('b', [], {
      variables: [
        variable('inText', { kind: 'string' }, { direction: 'input', defaultValue: lit('a') }),
        variable('outNum', { kind: 'number' }, { direction: 'output' }),
        variable('items', { kind: 'list', of: { kind: 'string' } }),
      ],
    });
    expect(body(b)).toEqual([
      'defVar --name inText --type String --value "a" --parameter',
      'defVar --name outNum --type Numeric --output',
      'defVar --name items --type List --innertype String',
    ]);
  });

  it('never writes a hardcoded credential value', () => {
    const b = bot('b', [], {
      variables: [
        variable('pwd', { kind: 'credential' }, { sensitive: true, defaultValue: lit('S3cret!') }),
      ],
    });
    const script = lowerBot(b, opts);
    expect(script.text).not.toContain('S3cret!');
    expect(script.notes.some((n) => n.kind === 'manual' && n.text.includes('vault'))).toBe(true);
  });

  it('reads a vault password with getVaultItem and leaves other attributes to the developer', () => {
    const vault = (attribute: string): Expr => ({
      kind: 'call',
      fn: 'credential.vault',
      args: [lit('Locker'), lit('Login'), lit(attribute)],
    });
    const b = bot('b', [], {
      variables: [
        variable(
          'pwd',
          { kind: 'credential' },
          { sensitive: true, defaultValue: vault('password') },
        ),
        variable(
          'usr',
          { kind: 'credential' },
          { sensitive: true, defaultValue: vault('username') },
        ),
      ],
    });
    const out = body(b);
    expect(out).toContain('getVaultItem --name "Login" pwd=password');
    expect(out.some((l) => l.startsWith('getVaultItem') && l.includes('usr'))).toBe(false);
    expect(out.some((l) => l.startsWith('// TODO [ROSETTA] usr: vault attribute "username"'))).toBe(
      true,
    );
  });

  it('writes a TODO for an Excel command whose session was never opened', () => {
    const b = bot('b', [
      action('excel.setCell', {
        args: { session: lit('Other'), cellOption: lit('SPECIFIC_CELL') },
      }),
    ]);
    expect(body(b)).toContain(
      '// TODO [ROSETTA] excel.setCell: Excel session "Other" was not opened in this bot',
    );
  });

  it('writes control flow blocks', () => {
    const b = bot('b', [
      group('Step', [
        comment('hello'),
        ifThen(
          { kind: 'binary', op: 'gt', left: ref('n'), right: lit(5) },
          [action('vendor:a360/X/y')],
          [],
        ),
        loopTimes(3, []),
        tryCatch([], [{ errorVar: ref('err'), body: [] }]),
      ]),
    ]);
    expect(body(b)).toEqual([
      '// ---- Helper variables added by the conversion ----',
      'defVar --name rosettaIndex1 --type Numeric',
      'defVar --name rosettaTry1Failed --type Boolean',
      '// ---- Step ----',
      '// hello',
      'if --left "${n}" --operator "Greater_Than" --right 5',
      '// A360 X/y (not converted; inputs below):',
      'goSub --label Rosetta_X_y',
      'else',
      'endIf',
      'for --variable ${rosettaIndex1} --from 1 --to 3 --step 1',
      'next',
      'setVar --name "${rosettaTry1Failed}" --value False',
      'goSub --label Try1',
      '// ---- Subroutines added by the conversion (A360 Try/Catch) ----',
      'beginSub --name Try1',
      '// A360 Try (source)',
      'onError --label Catch1',
      'endSub',
      'beginSub --name Catch1',
      '// A360 Catch (all errors)',
      'setVar --name "${rosettaTry1Failed}" --value True',
      'setVar --name "${err}" --value "${rpa:errorMessage}"',
      'recover',
      'endSub',
      '// ---- Stub subroutines: A360 commands with no IBM RPA conversion yet ----',
      'beginSub --name Rosetta_X_y',
      '// A360 X/y: no IBM RPA conversion yet. Replace this body.',
      'failTest --message "Not converted: A360 X/y (Rosetta stub Rosetta_X_y)"',
      'endSub',
    ]);
  });

  it('skips the rest of a Try block after an error, like A360', () => {
    const t = tryCatch(
      [
        action('string.upper', { args: { sourceString: ref('a') }, outputs: { result: ref('a') } }),
        action('string.lower', { args: { sourceString: ref('a') }, outputs: { result: ref('a') } }),
      ],
      [
        {
          body: [
            action('string.upper', {
              args: { sourceString: ref('e') },
              outputs: { result: ref('e') },
            }),
          ],
        },
      ],
      [comment('cleanup')],
    );
    const lines = body(bot('b', [t]));
    const sub = lines.slice(lines.indexOf('beginSub --name Try1'), lines.indexOf('endSub') + 1);
    // a flag check follows every command of the protected block
    expect(sub).toEqual([
      'beginSub --name Try1',
      '// A360 Try (source)',
      'onError --label Catch1',
      'changeTextCase --text "${a}" --type "Upper" a=value',
      'if --left "${rosettaTry1Failed}" --operator "Is_True"',
      'return',
      'endIf',
      'changeTextCase --text "${a}" --type "Lower" a=value',
      'if --left "${rosettaTry1Failed}" --operator "Is_True"',
      'return',
      'endIf',
      'endSub',
    ]);
    // Finally runs in the main flow, right after the protected block
    expect(lines.indexOf('// cleanup')).toBe(lines.indexOf('goSub --label Try1') + 2);
  });

  it('restores the outer error handler after a nested Try returns (round 5)', () => {
    const inner = tryCatch([action('vendor:a360/X/y')], [{ body: [] }]);
    const lines = body(bot('b', [tryCatch([inner, action('vendor:a360/X/z')], [{ body: [] }])]));
    const call = lines.indexOf('goSub --label Try2');
    expect(lines[call + 1]).toBe('onError --label Catch1');
  });

  it('ends every error handler with recover and never returns from it', () => {
    const inner = tryCatch(
      [action('vendor:a360/X/y')],
      [
        {
          body: [
            action('string.upper', {
              args: { sourceString: ref('e') },
              outputs: { result: ref('e') },
            }),
          ],
        },
      ],
    );
    const outer = tryCatch([inner], [{ body: [] }]);
    const lines = body(bot('b', [outer]));
    for (const name of ['Catch1', 'Catch2']) {
      const start = lines.indexOf(`beginSub --name ${name}`);
      const handler = lines.slice(start, lines.indexOf('endSub', start) + 1);
      expect(handler.at(-2)).toBe('recover');
      expect(handler).not.toContain('return');
    }
  });

  it('reads list items and dictionary values into helper variables before the statement', () => {
    const access = (
      name: string,
      step: { kind: 'index'; index: Expr } | { kind: 'key'; key: Expr },
    ) => ({ kind: 'var', name, path: [step] }) as const;
    const b = bot(
      'b',
      [
        action('variable.assign', {
          args: {
            sourceString: {
              kind: 'template',
              parts: [
                access('items', { kind: 'index', index: lit(0) }),
                access('items', { kind: 'index', index: ref('i') }),
                access('map', { kind: 'key', key: lit('name') }),
              ],
            },
          },
          outputs: { result: ref('out') },
        }),
      ],
      {
        variables: [
          variable('items', { kind: 'list', of: { kind: 'string' } }),
          variable('map', { kind: 'dict', of: { kind: 'string' } }),
        ],
      },
    );
    const lines = body(b).filter((l) => !l.startsWith('defVar') && !l.startsWith('//'));
    expect(lines).toEqual([
      'get --collection "${items}" --index 1 rosettaItem1=value',
      'evaluate --expression "${i} + 1" rosettaIndex3=value',
      'get --collection "${items}" --index ${rosettaIndex3} rosettaItem2=value',
      'strDictGet --key "name" --dictionary ${map} rosettaItem4=value',
      'setVar --name "${out}" --value "${rosettaItem1}${rosettaItem2}${rosettaItem4}"',
    ]);
  });

  it('fills the machine name once when the bot uses it', () => {
    const b = bot('b', [
      action('variable.assign', {
        args: { sourceString: { kind: 'system', name: 'a360:Machine' } },
        outputs: { result: ref('m') },
      }),
    ]);
    const lines = body(b);
    expect(lines).toContain(
      'getEnvVar --name COMPUTERNAME --target "Process" rosettaMachineName=value',
    );
    expect(lines.at(-1)).toBe('setVar --name "${m}" --value "${rosettaMachineName}"');
  });

  it('keeps disabled statements as comments and lists them', () => {
    const b = bot('b', [
      {
        ...action('string.upper', {
          args: { sourceString: ref('t') },
          outputs: { result: ref('t') },
        }),
        disabled: true,
      },
    ]);
    const script = lowerBot(b, opts);
    expect(body(b)).toEqual(['// [DISABLED] changeTextCase --text "${t}" --type "Upper" t=value']);
    expect(script.notes.some((n) => n.text.startsWith('Disabled in the source'))).toBe(true);
  });

  it('flags a break that targets an outer loop', () => {
    const inner = {
      ...loopTimes(2, [{ id: 'br', kind: 'break' as const, target: 'Outer' }]),
      label: 'Inner',
    };
    const outer = { ...loopTimes(2, [inner]), label: 'Outer' };
    const script = lowerBot(bot('b', [outer]), opts);
    expect(script.notes.some((n) => n.kind === 'manual' && n.text.includes('"Outer"'))).toBe(true);
  });

  it('attaches notes to the right line numbers', () => {
    const b = bot('b', [
      tryCatch([action('vendor:a360/X/y')], [{ body: [action('vendor:a360/X/z')] }]),
    ]);
    const script = lowerBot(b, opts);
    const all = script.text.split('\r\n');
    // notes written inside subroutines are shifted when the subroutines are appended
    // commands with no conversion become a call to a stub subroutine (A-27)
    for (const key of ['X/y', 'X/z']) {
      const note = script.notes.find((n) => n.kind === 'manual' && n.text.startsWith(`${key}:`));
      expect(all[(note?.line ?? 0) - 1]).toContain(
        `goSub --label Rosetta_${key.replace('/', '_')}`,
      );
    }
  });
});

describe('renderNotes', () => {
  it('groups notes by kind and syntax checks by assumption', () => {
    const md = renderNotes('x.wal', [
      { line: 3, kind: 'verify', assumption: 'W-03', text: 'defVar' },
      { line: 4, kind: 'verify', assumption: 'W-03', text: 'defVar' },
      { line: 9, kind: 'manual', text: 'todo | pipe' },
    ]);
    expect(md).toContain('| W-03 | defVar | 3, 4 |');
    expect(md).toContain('| 9 | todo \\| pipe |');
    expect(md.indexOf('Needs manual work')).toBeLessThan(md.indexOf('Draft syntax'));
  });
});
