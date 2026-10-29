import { walk, type Block, type Bot, type Expr, type Statement, type Variable } from '@rosetta/ir';
import type { StandardsProfile } from '@rosetta/standards';
import { lowerers, manual, type LowerState } from './commands.js';
import { textOf, valueOf, type NoteSink } from './expr.js';
import {
  errorLineRef,
  errorMessageRef,
  quote,
  ref,
  systemValues,
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

const docNote = (text: string): NoteInput => ({ kind: 'verify', assumption: 'W-18', text });

function condition(expr: Expr, sink: NoteSink): string {
  if (
    expr.kind === 'binary' &&
    expr.op === 'eq' &&
    expr.right.kind === 'literal' &&
    typeof expr.right.value === 'boolean'
  ) {
    // "Is_True" verified in Studio, round 1.
    const negate = expr.right.value ? '' : ' --negate';
    return `--left ${valueOf(expr.left, sink)} --operator "Is_True"${negate}`;
  }
  if (expr.kind === 'binary' && walOperators[expr.op]) {
    return `--left ${valueOf(expr.left, sink)} --operator "${walOperators[expr.op] ?? ''}" --right ${valueOf(expr.right, sink)}`;
  }
  sink({ kind: 'manual', text: 'Condition could not be converted; placeholder written.' });
  return `--left "{{ROSETTA: condition}}" --operator "Equal_To" --right "true"`;
}

/** Statements after which a protected block checks its "failed" flag. */
const canFail = (s: Statement): boolean =>
  (s.kind === 'action' && s.op !== 'csv.open') ||
  s.kind === 'throw' ||
  s.kind === 'callBot' ||
  s.kind === 'try';

class Lowerer {
  /** Writer for the main flow; subroutines are written separately and appended at the end. */
  w = new WalWriter();
  readonly subs: WalWriter[] = [];
  /** Helper variables (defVar lines) the conversion needs, declared after the bot's own. */
  readonly helperVars: string[] = [];
  readonly state: LowerState = { csvSessions: new Map() };
  private readonly loops: (string | undefined)[] = [];
  /** "failed" flags of the protected blocks being written, innermost last. */
  private readonly guards: string[] = [];
  private tries = 0;
  private helpers = 0;

  /** Writes a line with notes collected from expression lowering. */
  private emit(build: (sink: NoteSink) => string, ...notes: NoteInput[]): void {
    const pending: NoteInput[] = [];
    const text = build((n) => pending.push(n));
    this.w.line(text, ...pending, ...notes);
  }

  private helperVar(prefix: string, defVar: (name: string) => string): string {
    const name = `rosetta${prefix}${++this.helpers}`;
    this.helperVars.push(defVar(name));
    return name;
  }

  block(block: Block): void {
    for (const s of block) {
      this.statement(s);
      const guard = this.guards.at(-1);
      if (guard && canFail(s) && !s.disabled && !this.w.inComment) {
        // A360 leaves the Try block at the first error; WAL `recover` resumes at the next
        // command, so the protected subroutine returns as soon as its handler ran.
        this.w.line(`if --left "${ref(guard)}" --operator "Is_True"`);
        this.w.line('return', docNote('return (Return from Subroutine)'));
        this.w.line('endIf');
      }
    }
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
          this.emit(
            (sink) => `${i === 0 ? 'if' : 'elseIf'} ${condition(b.condition, sink)}`,
            ...(i > 0 ? [docNote('elseIf')] : []),
          );
          this.block(b.body);
        });
        if (s.else) {
          w.line('else', docNote('else'));
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
        w.line(
          s.kind,
          docNote(s.kind === 'break' ? 'break (Interrupt Loop)' : 'continue'),
          ...notes,
        );
        return;
      }
      case 'try':
        this.tryCatch(s);
        return;
      case 'throw':
        // failTest verified in Studio (round 1); documented as the way to raise exceptions
        // that onError catches ("Raising your own exceptions").
        this.emit((sink) => `failTest --message ${valueOf(s.message, sink)}`);
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
    this.loops.push(s.label);
    try {
      if (spec.kind === 'times') {
        const index =
          spec.indexVar?.name ??
          this.helperVar('Index', (n) => `defVar --name ${n} --type Numeric`);
        this.emit(
          (sink) =>
            `for --variable ${ref(index)} --from 1 --to ${valueOf(spec.count, sink)} --step 1`,
          docNote('for / next'),
        );
        this.block(s.body);
        w.line('next');
      } else if (spec.kind === 'while' && spec.checkAtEnd) {
        w.line('do', docNote('do / loopWhile (Do-While)'));
        this.block(s.body);
        this.emit((sink) => `loopWhile ${condition(spec.condition, sink)}`);
      } else if (spec.kind === 'while') {
        this.emit(
          (sink) => `while ${condition(spec.condition, sink)}`,
          docNote('while / endWhile'),
        );
        this.block(s.body);
        w.line('endWhile');
      } else if (spec.collection === 'list') {
        this.emit(
          (sink) =>
            `foreach --collection ${valueOf(spec.source, sink)} --variable "${ref(spec.itemVar.name)}"`,
          docNote('foreach / endFor'),
        );
        this.block(s.body);
        w.line('endFor');
      } else if (spec.collection === 'dictKeys') {
        // foreach over a StringDictionary yields key-value pairs; A360 yields the keys.
        const pair = this.helperVar(
          'Entry',
          (n) => `defVar --name ${n} --type StringKeyValuePair --innertype String`,
        );
        this.emit(
          (sink) => `foreach --collection ${valueOf(spec.source, sink)} --variable "${ref(pair)}"`,
          docNote('foreach over a StringDictionary (documented collection type)'),
        );
        w.line(`setVar --name "${ref(spec.itemVar.name)}" --value "${ref(`${pair}.Key`)}"`, {
          kind: 'verify',
          assumption: 'W-04',
          text: `Key of the current entry read as ${ref(`${pair}.Key`)}; confirm the property name.`,
        });
        this.block(s.body);
        w.line('endFor');
      } else {
        w.comment(
          `TODO [ROSETTA] loop over ${spec.collection} not converted yet; source kept below as comments.`,
          {
            kind: 'manual',
            text: `Loop over ${spec.collection} (source: ${textOf(spec.source, () => undefined)}) not converted yet. WAL: getFiles returns paths, A360 gives a dictionary with name/extension.`,
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

  /**
   * A360 Try/Catch/Finally → WAL (documented: Handle Error, Exception handling scope):
   *
   *   setVar flag False / goSub Try_n / <finally>            (main flow)
   *   beginSub Try_n:   onError --label Catch_n, <body>, a flag check after each command
   *   beginSub Catch_n: flag True, error variables, <catch>, recover
   *
   * onError watches the subroutine it is called in; `recover` resumes after the failing
   * command, where the flag check returns from Try_n, so the rest of the body is skipped
   * like in A360.
   */
  private tryCatch(s: Extract<Statement, { kind: 'try' }>): void {
    const n = ++this.tries;
    const flag = `rosettaTry${n}Failed`;
    const trySub = `Try${n}`;
    const catchSub = `Catch${n}`;
    this.helperVars.push(`defVar --name ${flag} --type Boolean`);
    const main = this.w;

    main.line(`setVar --name "${ref(flag)}" --value False`);
    main.line(`goSub --label ${trySub}`, docNote('goSub / beginSub / endSub'));

    // Try subroutine
    const tryW = new WalWriter();
    this.subs.push(tryW);
    this.w = tryW;
    tryW.source = main.source;
    tryW.comment(`A360 Try (${main.source ?? 'source'})`);
    tryW.line(`beginSub --name ${trySub}`);
    if (s.catches.length > 0) {
      tryW.line(`onError --label ${catchSub}`, docNote('onError --label (Handle Error)'));
      this.guards.push(flag);
    }
    this.block(s.body);
    if (s.catches.length > 0) this.guards.pop();
    tryW.line('endSub');

    // Catch subroutine
    const catchW = new WalWriter();
    this.subs.push(catchW);
    this.w = catchW;
    catchW.source = main.source;
    const [first, ...others] = s.catches;
    if (first) {
      catchW.comment(`A360 Catch (${first.errorType ?? 'all errors'})`);
      catchW.line(`beginSub --name ${catchSub}`);
      catchW.line(`setVar --name "${ref(flag)}" --value True`);
      if (first.errorVar) {
        catchW.line(
          `setVar --name "${ref(first.errorVar.name)}" --value "${errorMessageRef}"`,
          docNote(`${errorMessageRef} (error environment variable)`),
        );
      }
      if (first.lineVar) {
        catchW.line(
          `setVar --name "${ref(first.lineVar.name)}" --value ${errorLineRef}`,
          docNote(`${errorLineRef} (error environment variable)`),
        );
      }
      if (first.errorType && first.errorType !== 'BotException') {
        catchW.note({
          kind: 'semantic',
          text: `A360 catches only ${first.errorType}; WAL onError catches every error.`,
        });
      }
      if (others.length > 0) {
        catchW.note({
          kind: 'manual',
          text: 'Several A360 catch blocks: only the first is converted.',
        });
      }
      let rethrows = 0;
      walk(first.body, (x) => {
        if (x.kind === 'throw') rethrows++;
      });
      if (rethrows > 0) {
        catchW.note({
          kind: 'manual',
          text: 'The catch block throws again; check how WAL handles an error raised inside an error handler.',
        });
      }
      // An error handler must end with recover (documented), so no flag check returns from it.
      const outer = this.guards.splice(0);
      this.block(first.body);
      this.guards.push(...outer);
      catchW.line('recover', docNote('recover (Recover From Error)'));
      catchW.line('endSub');
    }
    this.w = main;

    if (s.finally) {
      main.comment(
        'A360 Finally: runs after the protected block, with or without an error',
        ...(s.catches.length === 0
          ? [
              {
                kind: 'manual' as const,
                text: 'Try/Finally without Catch: an error leaves the bot before the Finally commands run.',
              },
            ]
          : []),
      );
      this.block(s.finally);
    }
  }

  variables(vars: readonly Variable[]): void {
    const w = this.w;
    const init: (() => void)[] = [];
    for (const v of vars) {
      const notes: NoteInput[] = [];
      let type = walTypes[v.type.kind];
      if (!type) {
        type = 'String';
        notes.push({
          kind: 'manual',
          text: `Variable ${v.name}: source type ${v.type.kind} has no WAL type yet; declared as String.`,
        });
      } else if (!['string', 'number', 'boolean', 'table'].includes(v.type.kind)) {
        notes.push(docNote(`defVar --type ${type}`));
      }
      let line = `defVar --name ${v.name} --type ${type}`;
      if (v.type.kind === 'list' || v.type.kind === 'dict')
        line += ` --innertype ${walTypes[v.type.of.kind] ?? 'String'}`;

      const d = v.defaultValue;
      if (v.type.kind === 'credential') {
        if (d)
          notes.push({
            kind: 'manual',
            text: `Credential ${v.name} had a hardcoded value in the source; not carried over. Read it from the vault (getVaultItem).`,
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
      } else if (d?.kind === 'call' && d.fn === 'list.of' && d.args.length > 0) {
        const items = d.args.map((a) => (a.kind === 'literal' ? String(a.value) : undefined));
        if (items.every((i): i is string => i !== undefined && !/[,[\]"]/.test(i))) {
          // documented: defVar --type List --innertype String --value "[a,b,c]"
          line += ` --value "[${items.join(',')}]"`;
          notes.push(docNote('list initial value "[a,b,c]"'));
        } else {
          init.push(() => {
            for (const item of d.args)
              this.emit(
                (sink) => `add --collection "${ref(v.name)}" --value ${valueOf(item, sink)}`,
                docNote('add'),
              );
          });
        }
      } else if (d?.kind === 'call' && d.fn === 'dict.of' && d.args.length > 0) {
        init.push(() => {
          for (let i = 0; i + 1 < d.args.length; i += 2) {
            const key = d.args[i];
            const value = d.args[i + 1];
            if (key && value) {
              this.emit(
                (sink) =>
                  `strDictAdd --key ${valueOf(key, sink)} --value ${valueOf(value, sink)} --dictionary ${ref(v.name)}`,
                docNote('strDictAdd'),
              );
            }
          }
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
      w.comment('---- Initial values of dictionaries ----');
      for (const f of init) f();
    }
  }
}

/** Collects the A360 system variables a bot uses. */
function systemNames(bot: Bot): Set<string> {
  const names = new Set<string>();
  const json = JSON.stringify(bot.body);
  for (const m of json.matchAll(/"kind":"system","name":"([^"]+)"/g)) if (m[1]) names.add(m[1]);
  return names;
}

/** Generates a WAL script for one bot, with notes for every line to check. */
export function lowerBot(bot: Bot, options: LowerOptions): WalScript {
  const l = new Lowerer();

  // Body first: it decides which helper variables and subroutines are needed.
  l.w = new WalWriter();
  l.block(bot.body);
  const body = l.w;

  const out = new WalWriter();
  const fields = new Set(options.profile.header.fields);
  const io = (dir: 'input' | 'output') =>
    bot.variables
      .filter((v) => v.direction === dir || v.direction === 'inout')
      .map((v) => `${v.name} (${walTypes[v.type.kind] ?? v.type.kind})`)
      .join(', ') || 'none';
  out.comment('='.repeat(70));
  if (fields.has('name')) out.comment(`Bot:         ${bot.name}`);
  if (fields.has('description') && bot.description) out.comment(`Description: ${bot.description}`);
  if (fields.has('sourceRef'))
    out.comment(`Source:      ${bot.source.file} (Automation Anywhere A360)`);
  if (fields.has('convertedAt')) out.comment(`Converted:   ${options.generatedAt}`);
  if (fields.has('rosettaVersion'))
    out.comment(`Generator:   RPA Rosetta ${options.rosettaVersion}`);
  if (fields.has('inputs')) out.comment(`Inputs:      ${io('input')}`);
  if (fields.has('outputs')) out.comment(`Outputs:     ${io('output')}`);
  out.comment(
    'Status:      DRAFT - syntax from the IBM RPA 30.0.x reference, being verified in Studio 30.0.2',
  );
  out.comment('='.repeat(70));

  l.w = out;
  l.variables(bot.variables);
  const system = [...systemNames(bot)].flatMap((n) => systemValues[n]?.init ?? []);
  const helperDefs = [...l.helperVars, ...system.filter((x) => x.startsWith('defVar'))];
  if (helperDefs.length) {
    out.comment('---- Helper variables added by the conversion ----');
    for (const d of helperDefs) out.line(d);
  }
  for (const cmd of system.filter((x) => !x.startsWith('defVar')))
    out.line(cmd, docNote(cmd.split(' ')[0] ?? ''));

  out.append(body);
  if (l.subs.length) {
    out.comment('---- Subroutines added by the conversion (A360 Try/Catch) ----');
    for (const s of l.subs) out.append(s);
  }
  return { fileName: `${bot.name}.wal`, text: out.toString(), notes: out.notes };
}
