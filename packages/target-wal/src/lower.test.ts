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

  it('writes a visible placeholder and a manual note for unknown values', () => {
    notes.length = 0;
    expect(textOf({ kind: 'system', name: 'a360:Machine' }, sink)).toBe(
      '{{ROSETTA: a360:Machine}}',
    );
    expect(notes[0]?.kind).toBe('manual');
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
      '// ---- Step ----',
      '// hello',
      'if --left "${n}" --operator "Greater_Than" --right 5',
      '// TODO [ROSETTA] vendor:a360/X/y: no conversion for this command yet',
      'else',
      'endIf',
      'for --variable ${rosettaIndex} --from 1 --to 3 --step 1',
      'next',
      '// tryCatch (A360 Try: no WAL error handling written yet)',
      '// catch (A360 Catch: kept as comments, they must only run after an error)',
      '// setVar --name "${err}" --value "${wdg:error.Message}"',
      '// endTryCatch',
    ]);
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
    expect(body(b)).toEqual(['// [DISABLED] toUpper --text "${t}" t=value']);
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
    const b = bot('b', [action('string.indexOf')]);
    const script = lowerBot(b, opts);
    const all = script.text.split('\r\n');
    const note = script.notes.find((n) => n.kind === 'manual');
    expect(all[(note?.line ?? 0) - 1]).toContain('TODO [ROSETTA] string.indexOf');
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
