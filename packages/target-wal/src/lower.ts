import { walk, type Block, type Bot, type Expr, type Statement, type Variable } from '@rosetta/ir';
import type { StandardsProfile } from '@rosetta/standards';
import { lowerers, manual, type LowerState } from './commands.js';
import { textOf, valueOf, type NoteSink } from './expr.js';
import {
  errorLineRef,
  errorMessageRef,
  quote,
  ref,
  walBoolean,
  walOperators,
  walTypes,
} from './syntax.js';
import { WalWriter, type NoteInput, type WalNote } from './writer.js';

export interface LowerOptions {
  readonly profile: StandardsProfile;
  /** ISO timestamp written in the header. */
  readonly generatedAt: string;
  readonly rosettaVersion: string;
}

export interface WalScript {
  /** Suggested file name, `<bot>.wal`. */
  readonly fileName: string;
  readonly text: string;
  readonly notes: readonly WalNote[];
}

const label = (s: Statement): string | undefined =>
  s.source
    ? `${s.source.label ?? s.kind} @ ${s.source.nodePath.map((i) => i + 1).join('.')}`
    : undefined;

function condition(expr: Expr, sink: NoteSink): string {
  if (
    expr.kind === 'binary' &&
    expr.op === 'eq' &&
    expr.right.kind === 'literal' &&
    typeof expr.right.value === 'boolean'
  ) {
    const negate = expr.right.value ? '' : ' --negate';
    return `--left ${valueOf(expr.left, sink)} --operator "Is_True"${negate}`;
  }
  if (expr.kind === 'binary' && walOperators[expr.op]) {
    return `--left ${valueOf(expr.left, sink)} --operator "${walOperators[expr.op] ?? ''}" --right ${valueOf(expr.right, sink)}`;
  }
  sink({ kind: 'manual', text: 'Condition could not be converted; placeholder written.' });
  return `--left "{{ROSETTA: condition}}" --operator "Equal_To" --right "true"`;
}

class Lowerer {
  readonly w = new WalWriter();
  readonly state: LowerState = { csvSessions: new Map() };
  private readonly loops: (string | undefined)[] = [];

  /** Writes a line with notes collected from expression lowering. */
  private emit(build: (sink: NoteSink) => string, ...notes: NoteInput[]): void {
    const pending: NoteInput[] = [];
    const text = build((n) => pending.push(n));
    this.w.line(text, ...pending, ...notes);
  }

  block(block: Block): void {
    for (const s of block) this.statement(s);
  }

  statement(s: Statement): void {
    const saved = this.w.source;
    this.w.source = label(s);
    try {
      if (s.disabled && !this.w.inComment) {
        this.w.commented('[DISABLED] ', () => {
          this.statementBody(s);
        });
        this.w.note({
          kind: 'manual',
          text: 'Disabled in the source: kept as comments, not converted. Confirm it can be removed.',
        });
        return;
      }
      this.statementBody(s);
    } finally {
      this.w.source = saved;
    }
  }

  private statementBody(s: Statement): void {
    const w = this.w;
    switch (s.kind) {
      case 'comment':
        w.comment(s.text);
        return;
      case 'group':
        w.comment(`---- ${s.label} ----`);
        this.block(s.body);
        return;
      case 'action': {
        const lower = lowerers[s.op];
        if (lower) lower(s, w, this.state);
        else manual(s, w, 'no conversion for this command yet');
        return;
      }
      case 'if':
        s.branches.forEach((b, i) => {
          this.emit((sink) => `${i === 0 ? 'if' : 'elseIf'} ${condition(b.condition, sink)}`, {
            kind: 'verify',
            assumption: 'W-05',
            text: 'if / elseIf condition syntax',
          });
          this.block(b.body);
        });
        if (s.else) {
          w.line('else');
          this.block(s.else);
        }
        w.line('endIf');
        return;
      case 'loop':
        this.loop(s);
        return;
      case 'break':
      case 'continue': {
        const innermost = this.loops.at(-1);
        const notes: NoteInput[] =
          s.target !== undefined && s.target !== innermost
            ? [
                {
                  kind: 'manual',
                  text: `${s.kind} targets loop "${s.target}", which is not the innermost loop; WAL ${s.kind} affects the innermost loop.`,
                },
              ]
            : [];
        w.line(s.kind, { kind: 'verify', assumption: 'W-05', text: s.kind }, ...notes);
        return;
      }
      case 'try':
        this.tryCatch(s);
        return;
      case 'throw':
        this.emit((sink) => `failTest --message ${valueOf(s.message, sink)}`, {
          kind: 'verify',
          assumption: 'W-09',
          text: 'failTest as "throw": confirm an enclosing tryCatch catches it instead of ending the bot.',
        });
        return;
      case 'callBot':
      case 'stop':
      case 'unknown':
        w.comment(`TODO [ROSETTA] ${s.kind} not converted yet`, {
          kind: 'manual',
          text: `${s.kind} statement not converted yet.`,
        });
        if (s.kind === 'unknown' && s.body)
          w.commented('', () => {
            this.block(s.body ?? []);
          });
        return;
    }
  }

  private loop(s: Extract<Statement, { kind: 'loop' }>): void {
    const w = this.w;
    const spec = s.loop;
    const loopVerify: NoteInput = {
      kind: 'verify',
      assumption: 'W-05',
      text: `${spec.kind} loop syntax`,
    };
    this.loops.push(s.label);
    try {
      if (spec.kind === 'times') {
        this.emit(
          (sink) =>
            `for --variable ${ref(spec.indexVar?.name ?? 'rosettaIndex')} --from 1 --to ${valueOf(spec.count, sink)} --step 1`,
          loopVerify,
        );
        this.block(s.body);
        w.line('next');
      } else if (spec.kind === 'while') {
        const notes: NoteInput[] = spec.checkAtEnd
          ? [
              {
                kind: 'semantic',
                text: 'A360 checks this condition at the end (do-while); WAL while checks first.',
              },
            ]
          : [];
        this.emit((sink) => `while ${condition(spec.condition, sink)}`, loopVerify, ...notes);
        this.block(s.body);
        w.line('endWhile');
      } else if (spec.collection === 'list' || spec.collection === 'dictKeys') {
        const notes: NoteInput[] =
          spec.collection === 'dictKeys'
            ? [
                {
                  kind: 'semantic',
                  text: 'A360 iterates the dictionary keys; confirm what WAL foreach yields for a StringDictionary.',
                },
              ]
            : [];
        this.emit(
          (sink) =>
            `foreach --collection ${valueOf(spec.source, sink)} --variable "${ref(spec.itemVar.name)}"`,
          loopVerify,
          ...notes,
        );
        this.block(s.body);
        w.line('endFor');
      } else {
        w.comment(
          `TODO [ROSETTA] loop over ${spec.collection} not converted yet; source kept below as comments.`,
          {
            kind: 'manual',
            text: `Loop over ${spec.collection} (source: ${textOf(spec.source, () => undefined)}) not converted yet.`,
          },
        );
        w.commented('', () => {
          this.block(s.body);
        });
      }
    } finally {
      this.loops.pop();
    }
  }

  private tryCatch(s: Extract<Statement, { kind: 'try' }>): void {
    const w = this.w;
    // Refuted in round 1: Studio 30.0.2 has no tryCatch / catch / endTryCatch. Until the WAL
    // error-handling construct is known, the block markers are written as comments.
    w.comment('tryCatch (A360 Try: no WAL error handling written yet)', {
      kind: 'manual',
      assumption: 'W-08',
      text: 'A360 Try/Catch is not converted yet: WAL has no tryCatch command (Studio round 1). The protected commands run without error handling.',
    });
    this.block(s.body);
    s.catches.forEach((c, i) => {
      const notes: NoteInput[] =
        c.errorType && c.errorType !== 'BotException'
          ? [
              {
                kind: 'semantic',
                text: `Catches only ${c.errorType} in A360; WAL catches all errors.`,
              },
            ]
          : [];
      if (i > 0)
        notes.push({
          kind: 'manual',
          text: 'Several catch blocks: only the first one is reached in WAL.',
        });
      w.comment(
        'catch (A360 Catch: kept as comments, they must only run after an error)',
        ...notes,
      );
      // Without a WAL error-handling construct, the catch body must not run on the normal path.
      w.commented('', () => {
        if (c.errorVar)
          w.line(`setVar --name "${ref(c.errorVar.name)}" --value "${errorMessageRef}"`, {
            kind: 'verify',
            assumption: 'W-08',
            text: `error message system value ${errorMessageRef}`,
          });
        if (c.lineVar)
          w.line(`setVar --name "${ref(c.lineVar.name)}" --value ${errorLineRef}`, {
            kind: 'verify',
            assumption: 'W-08',
            text: `error line system value ${errorLineRef}`,
          });
        this.block(c.body);
      });
    });
    w.comment('endTryCatch');
    if (s.finally) {
      let throws = 0;
      for (const c of s.catches) {
        walk(c.body, (x) => {
          if (x.kind === 'throw') throws++;
        });
      }
      const rethrows = throws > 0;
      w.comment('finally (emulated: runs after the try/catch)', {
        kind: rethrows || s.catches.length === 0 ? 'manual' : 'semantic',
        text:
          rethrows || s.catches.length === 0
            ? 'Finally is emulated after endTryCatch, but an error can leave the block first: the cleanup may not run.'
            : 'Finally is emulated after endTryCatch; equivalent here because every catch handles the error.',
      });
      this.block(s.finally);
    }
  }

  variables(vars: readonly Variable[]): void {
    const w = this.w;
    const init: (() => void)[] = [];
    for (const v of vars) {
      const notes: NoteInput[] = [
        { kind: 'verify', assumption: 'W-03', text: 'defVar and type name' },
      ];
      let type = walTypes[v.type.kind];
      if (!type) {
        type = 'String';
        notes.push({
          kind: 'manual',
          text: `Variable ${v.name}: source type ${v.type.kind} has no WAL type yet; declared as String.`,
        });
      }
      let line = `defVar --name ${v.name} --type ${type}`;
      if (v.type.kind === 'list' || v.type.kind === 'dict') {
        line += ` --innertype ${walTypes[v.type.of.kind] ?? 'String'}`;
      }

      const d = v.defaultValue;
      if (v.type.kind === 'credential') {
        if (d)
          notes.push({
            kind: 'manual',
            text: `Credential ${v.name} had a hardcoded value in the source; not carried over. Read it from the vault.`,
          });
      } else if (d?.kind === 'literal' && d.value !== null && d.value !== '') {
        if (v.type.kind === 'datetime') {
          notes.push({
            kind: 'manual',
            text: `DateTime default "${String(d.value)}" (A360 zoned format) not carried over.`,
          });
        } else {
          line += ` --value ${typeof d.value === 'boolean' ? walBoolean(d.value) : typeof d.value === 'number' ? String(d.value) : quote(d.value)}`;
        }
      } else if (
        d?.kind === 'call' &&
        (d.fn === 'list.of' || d.fn === 'dict.of') &&
        d.args.length > 0
      ) {
        init.push(() => {
          this.collectionInit(v.name, d);
        });
      } else if (
        d?.kind === 'call' &&
        d.fn === 'table.of' &&
        !/"rows":\[\{"values":\[\{"type":"STRING","string":""\}\]\}\]|"rows":\[\]/.test(
          JSON.stringify(d.args[0]),
        )
      ) {
        notes.push({
          kind: 'manual',
          text: `Table ${v.name} has default rows in the source; not carried over.`,
        });
      }
      if (v.direction === 'input' || v.direction === 'inout') line += ' --parameter';
      if (v.direction === 'output' || v.direction === 'inout') line += ' --output';
      w.line(line, ...notes);
    }
    if (init.length) {
      w.comment('---- Initial values of collections ----');
      for (const f of init) f();
    }
  }

  private collectionInit(name: string, d: Extract<Expr, { kind: 'call' }>): void {
    const verify: NoteInput = {
      kind: 'verify',
      assumption: 'W-03',
      text: 'filling a collection with add',
    };
    if (d.fn === 'list.of') {
      for (const item of d.args)
        this.emit(
          (sink) => `add --collection "${ref(name)}" --value ${valueOf(item, sink)}`,
          verify,
        );
      return;
    }
    for (let i = 0; i + 1 < d.args.length; i += 2) {
      const key = d.args[i];
      const value = d.args[i + 1];
      if (key && value)
        this.emit(
          (sink) =>
            `add --collection "${ref(name)}" --key ${valueOf(key, sink)} --value ${valueOf(value, sink)}`,
          verify,
        );
    }
  }
}

/** Generates a DRAFT WAL script for one bot, with notes for every line to check. */
export function lowerBot(bot: Bot, options: LowerOptions): WalScript {
  const l = new Lowerer();
  const w = l.w;
  const fields = new Set(options.profile.header.fields);
  const io = (dir: 'input' | 'output') =>
    bot.variables
      .filter((v) => v.direction === dir || v.direction === 'inout')
      .map((v) => `${v.name} (${walTypes[v.type.kind] ?? v.type.kind})`)
      .join(', ') || 'none';

  w.comment('='.repeat(70));
  if (fields.has('name')) w.comment(`Bot:         ${bot.name}`);
  if (fields.has('description') && bot.description) w.comment(`Description: ${bot.description}`);
  if (fields.has('sourceRef'))
    w.comment(`Source:      ${bot.source.file} (Automation Anywhere A360)`);
  if (fields.has('convertedAt')) w.comment(`Converted:   ${options.generatedAt}`);
  if (fields.has('rosettaVersion')) w.comment(`Generator:   RPA Rosetta ${options.rosettaVersion}`);
  if (fields.has('inputs')) w.comment(`Inputs:      ${io('input')}`);
  if (fields.has('outputs')) w.comment(`Outputs:     ${io('output')}`);
  w.comment('Status:      DRAFT - WAL syntax not yet verified in IBM RPA Studio 30.0.2');
  w.comment('='.repeat(70));

  l.variables(bot.variables);
  l.block(bot.body);

  return { fileName: `${bot.name}.wal`, text: w.toString(), notes: w.notes };
}
