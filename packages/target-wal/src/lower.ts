import {
  statementExprs,
  walk,
  walkExpr,
  type Block,
  type Bot,
  type Expr,
  type IRType,
  type Statement,
  type Variable,
} from '@rosetta/ir';
import type { StandardsProfile } from '@rosetta/standards';
import { lowerers, manual, sheetArg, type LowerState } from './commands.js';
import { accessKey, pathOf, textOf, valueOf, withAccesses, type NoteSink } from './expr.js';
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
  /** Helper variables declared once per key (e.g. the log timestamp). */
  private readonly sharedHelpers = new Map<string, string>();
  readonly state: LowerState = {
    csvSessions: new Map(),
    excelSessions: new Map(),
    varTypes: new Map(),
    vaultCredentials: new Map(),
    browsers: new Set(),
    jsonSessions: new Map(),
    emailSessions: new Map(),
    counts: new Map(),
    helper: (key, defVar) => {
      const known = this.sharedHelpers.get(key);
      if (known) return known;
      const name = `rosetta${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      this.helperVars.push(defVar(name));
      this.sharedHelpers.set(key, name);
      return name;
    },
  };
  private readonly loops: (string | undefined)[] = [];
  /** "failed" flags of the protected blocks being written, innermost last. */
  private readonly guards: string[] = [];
  /** Error handlers (onError labels) of the protected blocks being written, innermost last. */
  private readonly handlers: string[] = [];
  private tries = 0;
  private helpers = 0;
  /** Source variable types, to choose get vs strDictGet. */
  varTypes = new Map<string, IRType>();
  /**
   * Record variables → column name → WAL variable. WAL has no record type, so each column the
   * bot reads (`$vRow{Name}$`) becomes its own String variable, filled by mapTableRow.
   */
  recordFields = new Map<string, Map<string, string>>();

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
          this.withElementAccesses(s, () => {
            this.statementBody(s);
          });
        });
        this.w.note({
          kind: 'manual',
          text: 'Disabled in the source: kept as comments, not converted. Confirm it can be removed.',
        });
        return;
      }
      this.withElementAccesses(s, () => {
        this.statementBody(s);
      });
    } finally {
      this.w.source = saved;
    }
  }

  /**
   * WAL does not interpolate `${list[1]}` or `${dict[key]}` (Studio round 4). Each list item or
   * dictionary value the statement reads is fetched first into a helper variable with
   * `get` (Get List Item, 1-based) or `strDictGet` (Get Dictionary Value).
   */
  private withElementAccesses(s: Statement, body: () => void): void {
    const hoistable =
      s.kind === 'action' ||
      s.kind === 'throw' ||
      s.kind === 'callBot' ||
      s.kind === 'if' ||
      (s.kind === 'loop' && s.loop.kind !== 'while');
    const accesses = new Map<string, string>();
    if (hoistable) {
      for (const e of statementExprs(s)) {
        walkExpr(e, (x) => {
          if (x.kind !== 'var' || x.path.length !== 1 || accesses.has(accessKey(x))) return;
          const helper = this.fetchElement(x);
          if (helper) accesses.set(accessKey(x), helper);
        });
      }
    } else if (s.kind === 'loop' && JSON.stringify(s.loop).includes('"path":[{')) {
      this.w.note({
        kind: 'manual',
        text: 'The loop condition reads a list item or dictionary value; WAL needs it fetched with get / strDictGet inside the loop.',
      });
    }
    withAccesses((x) => accesses.get(accessKey(x)), body);
  }

  /** Writes the command that reads one list item / dictionary value; returns the helper variable. */
  private fetchElement(x: Extract<Expr, { kind: 'var' }>): string | undefined {
    const type = this.varTypes.get(x.name);
    const step = x.path[0];
    if (type?.kind === 'record' && step?.kind === 'key' && step.key.kind === 'literal')
      return this.recordFields.get(x.name)?.get(String(step.key.value));
    if (!step || (type?.kind !== 'list' && type?.kind !== 'dict')) return undefined;
    const itemType = walTypes[type.of.kind] ?? 'String';
    const helper = this.helperVar('Item', (n) => `defVar --name ${n} --type ${itemType}`);
    const pending: NoteInput[] = [];
    const sink: NoteSink = (n) => pending.push(n);
    if (type.kind === 'list' && step.kind === 'index') {
      const i = step.index;
      let index: string;
      if (i.kind === 'literal' && typeof i.value === 'number') {
        index = String(i.value + 1);
      } else {
        // A360 indexes are 0-based, WAL Get List Item is 1-based.
        const shifted = this.helperVar('Index', (n) => `defVar --name ${n} --type Numeric`);
        this.w.line(
          `evaluate --expression ${quote(`${textOf(i, sink)} + 1`)} ${shifted}=value`,
          ...pending.splice(0),
        );
        index = ref(shifted);
      }
      this.w.line(
        `get --collection "${ref(x.name)}" --index ${index} ${helper}=value`,
        ...pending.splice(0),
        docNote('get (Get List Item; index starts at 1, A360 at 0)'),
      );
      return helper;
    }
    if (type.kind === 'dict' && step.kind === 'key') {
      this.w.line(
        `strDictGet --key ${valueOf(step.key, sink)} --dictionary ${ref(x.name)} ${helper}=value`,
        ...pending.splice(0),
        docNote('strDictGet (Get Dictionary Value)'),
      );
      return helper;
    }
    return undefined;
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
        this.callBot(s);
        return;
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
      } else if (
        spec.collection === 'tableRow' &&
        spec.source.kind === 'call' &&
        (spec.source.fn === 'excel.rows' || spec.source.fn === 'csv.rows')
      ) {
        this.tableRows(
          s,
          spec.source.fn === 'excel.rows' ? 'Excel' : 'CSV',
          spec.source.args[0],
          spec.itemVar.name,
        );
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
   * A360 "For each row" of an Excel worksheet (corpus 05) or a CSV file (corpus 09) → read it
   * into a DataTable (excelGetTable / readCSV), then `for` over its rows with mapTableRow
   * filling one variable per column the body reads (documented pattern of Map Table Row).
   */
  private tableRows(
    s: Extract<Statement, { kind: 'loop' }>,
    kind: 'Excel' | 'CSV',
    sessionExpr: Expr | undefined,
    record: string,
  ): void {
    const w = this.w;
    const name =
      sessionExpr?.kind === 'literal' && sessionExpr.value !== null
        ? String(sessionExpr.value)
        : 'Default';
    const excel = kind === 'Excel' ? this.state.excelSessions.get(name) : undefined;
    const csv = kind === 'CSV' ? this.state.csvSessions.get(name) : undefined;
    const fields = this.recordFields.get(record) ?? new Map<string, string>();
    if ((!excel && !csv) || fields.size === 0) {
      w.comment(`TODO [ROSETTA] loop over the rows of ${kind} session "${name}" not converted`, {
        kind: 'manual',
        text:
          excel || csv
            ? `The loop body reads no column of ${record}; nothing to map.`
            : `${kind} session "${name}" was not opened in this bot.`,
      });
      w.commented('', () => {
        this.block(s.body);
      });
      return;
    }
    const table = this.helperVar('Table', (n) => `defVar --name ${n} --type DataTable`);
    let count: string;
    if (excel) {
      const rows = this.helperVar('Rows', (n) => `defVar --name ${n} --type Numeric`);
      w.line(
        `excelGetTable --file ${ref(excel.handle)} ${sheetArg(excel)} --entiretable${excel.header ? ' --hasheaders' : ''} ${table}=value ${rows}=rows`,
        docNote('excelGetTable (Get Excel Table)'),
        {
          kind: 'semantic',
          text: 'A360 reads the rows one by one from the workbook; WAL reads the first sheet once, before the loop. Cells are read as text in both.',
        },
      );
      count = ref(rows);
    } else {
      const path = csv?.path ?? { kind: 'literal' as const, value: '' };
      this.emit(
        (sink) =>
          `readCSV --filepath ${pathOf(path, sink)} --delimiter ","${csv?.header ? ' --hasheaders' : ''} ${table}=value`,
        docNote('readCSV'),
        {
          kind: 'semantic',
          text: 'A360 reads the file row by row; WAL reads it whole, before the loop.',
        },
      );
      count = ref(`${table}.Rows`);
    }
    const index = this.helperVar('Index', (n) => `defVar --name ${n} --type Numeric`);
    w.line(
      `for --variable ${ref(index)} --from 1 --to ${count} --step 1`,
      docNote('for / next'),
      ...(excel
        ? []
        : [docNote('row count ${table.Rows} (documented in the Map Table Row examples)')]),
    );
    // Columns mapped by name ("name=<column>=${var}"): verified in Studio round 9.
    const mappings = [...fields].map(([column, v]) => `name=${column}=${ref(v)}`).join(',');
    w.line(
      `mapTableRow --dataTable ${ref(table)} --row ${ref(index)} --mappings ${quote(mappings)}`,
      ...([...fields.keys()].some((c) => /[s,=]/.test(c))
        ? [docNote('mapTableRow with a column name containing a space, comma or "="')]
        : []),
    );
    this.block(s.body);
    w.line('next');
  }

  /**
   * A360 Run Task Bot (corpus 08) → executeScript (documented). The child is called by its bot
   * name, the last part of the A360 repository path; inputs and outputs keep the child's
   * variable names, which the conversion of the child keeps too.
   */
  private callBot(s: Extract<Statement, { kind: 'callBot' }>): void {
    const name = s.target.path.split('/').at(-1) ?? s.target.path;
    this.emit(
      (sink) => {
        const json = (entries: [string, string][]) =>
          quote(JSON.stringify(Object.fromEntries(entries)));
        const inputs = Object.entries(s.inputs).map(([k, e]): [string, string] => [
          k,
          textOf(e, sink),
        ]);
        const outputs = Object.entries(s.outputs).map(([k, v]): [string, string] => [
          k,
          ref(v.name),
        ]);
        return (
          `executeScript --name ${quote(name)}` +
          (inputs.length ? ` --parameters ${json(inputs)}` : '') +
          (outputs.length ? ` --output ${json(outputs)}` : '')
        );
      },
      docNote('executeScript --parameters / --output as JSON (Execute Script)'),
      {
        kind: 'manual',
        text: `Calls script "${name}" (A360: ${s.target.path}). Publish the converted ${name}.wal to the tenant under that name, or replace it with the full path of the .wal file.`,
      },
    );
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
    const outerHandler = this.handlers.at(-1);
    if (outerHandler && !main.inComment) {
      // The inner onError replaced the outer one (Studio round 5: the outer Catch did not run);
      // restore it for the rest of the enclosing Try.
      main.line(`onError --label ${outerHandler}`);
    }

    // Try subroutine
    const tryW = new WalWriter();
    this.subs.push(tryW);
    this.w = tryW;
    tryW.source = main.source;
    tryW.line(`beginSub --name ${trySub}`);
    tryW.comment(`A360 Try (${main.source ?? 'source'})`);
    if (s.catches.length > 0) {
      tryW.line(`onError --label ${catchSub}`, docNote('onError --label (Handle Error)'));
      this.guards.push(flag);
      this.handlers.push(catchSub);
    }
    this.block(s.body);
    if (s.catches.length > 0) {
      this.guards.pop();
      this.handlers.pop();
    }
    tryW.line('endSub');

    // Catch subroutine
    const catchW = new WalWriter();
    this.subs.push(catchW);
    this.w = catchW;
    catchW.source = main.source;
    const [first, ...others] = s.catches;
    if (first) {
      catchW.line(`beginSub --name ${catchSub}`);
      catchW.comment(`A360 Catch (${first.errorType ?? 'all errors'})`);
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
      // lets source-wal tell the Finally commands from the ones after the Try (ADR-022)
      main.comment('A360 Finally end');
    }
  }

  variables(vars: readonly Variable[]): (() => void)[] {
    const w = this.w;
    const init: (() => void)[] = [];
    for (const v of vars) {
      const notes: NoteInput[] = [];
      if (v.type.kind === 'handle' && v.type.resource === 'browser') {
        w.comment(`${v.name} (A360 browser window): WAL works in the browser started by webStart`);
        continue;
      }
      if (v.type.kind === 'record') {
        const fields = this.recordFields.get(v.name);
        if (fields?.size) {
          w.comment(`${v.name} (A360 Record): one String variable per column the bot reads`);
          for (const f of fields.values()) w.line(`defVar --name ${f} --type String`);
          continue;
        }
      }
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
        const vault =
          d?.kind === 'call' && d.fn === 'credential.vault'
            ? d.args.map((x) => (x.kind === 'literal' ? String(x.value) : ''))
            : undefined;
        if (vault) {
          const [locker = '', credential = '', attribute = ''] = vault;
          init.push(() => {
            this.vaultItem(v.name, locker, credential, attribute);
          });
        } else if (d) {
          notes.push({
            kind: 'manual',
            text: `Credential ${v.name} had a hardcoded value in the source; not carried over. Read it from the vault (getVaultItem).`,
          });
        }
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
        // a backslash would need escaping inside the list text (corpus 11: `INV-(\d+)`); such items
        // are added one by one instead, where values are escaped
        if (items.every((i): i is string => i !== undefined && !/[,[\]"\\]/.test(i))) {
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
    // Studio requires every defVar before the first command (round 2), so the commands that
    // fill initial values are returned and written after all declarations.
    return init;
  }

  /**
   * A360 vault reference (locker / credential / attribute, corpus 08) → getVaultItem. The IBM
   * vault has no lockers: a credential has a name, a user name and a password.
   */
  private vaultItem(variable: string, locker: string, credential: string, attribute: string): void {
    const setup: NoteInput = {
      kind: 'manual',
      text: `Create credential "${credential}" in the IBM RPA vault (A360: locker "${locker}", attribute "${attribute}"); the value is never written in the script.`,
    };
    if (attribute.toLowerCase() !== 'password') {
      this.w.comment(
        `TODO [ROSETTA] ${variable}: vault attribute "${attribute}" (locker "${locker}", credential "${credential}")`,
        {
          kind: 'manual',
          text: `${variable} reads vault attribute "${attribute}": getVaultItem returns only userName (Text) and password (SecureString). Map it by hand.`,
        },
        setup,
      );
      return;
    }
    this.w.line(
      `getVaultItem --name ${quote(credential)} ${variable}=password`,
      docNote('getVaultItem (Get Vault Item)'),
      setup,
    );
  }
}

/** Collects the A360 system variables a bot uses. */
function systemNames(bot: Bot): Set<string> {
  const names = new Set<string>();
  const json = JSON.stringify(bot.body);
  for (const m of json.matchAll(/"kind":"system","name":"([^"]+)"/g)) if (m[1]) names.add(m[1]);
  return names;
}

/** Columns read from each record variable (`$vRow{Name}$`), in order of first use. */
function recordFields(bot: Bot): Map<string, Map<string, string>> {
  const records = new Set(bot.variables.filter((v) => v.type.kind === 'record').map((v) => v.name));
  const out = new Map<string, Map<string, string>>();
  walk(bot.body, (s) => {
    for (const e of statementExprs(s)) {
      walkExpr(e, (x) => {
        const step = x.kind === 'var' && records.has(x.name) ? x.path[0] : undefined;
        if (x.kind !== 'var' || step?.kind !== 'key' || step.key.kind !== 'literal') return;
        const column = String(step.key.value);
        const fields = out.get(x.name) ?? new Map<string, string>();
        if (!fields.has(column)) fields.set(column, `${x.name}_${column.replace(/\W/g, '_')}`);
        out.set(x.name, fields);
      });
    }
  });
  return out;
}

/** Generates a WAL script for one bot, with notes for every line to check. */
export function lowerBot(bot: Bot, options: LowerOptions): WalScript {
  const l = new Lowerer();
  l.varTypes = new Map(bot.variables.map((v) => [v.name, v.type]));
  l.recordFields = recordFields(bot);
  (l.state.varTypes as Map<string, IRType>).clear();
  for (const [k, v] of l.varTypes) (l.state.varTypes as Map<string, IRType>).set(k, v);
  for (const v of bot.variables) {
    const d = v.defaultValue;
    const name = d?.kind === 'call' && d.fn === 'credential.vault' ? d.args[1] : undefined;
    if (name?.kind === 'literal' && name.value !== null)
      (l.state.vaultCredentials as Map<string, string>).set(v.name, String(name.value));
  }

  // Body first: it decides which helper variables and subroutines are needed.
  l.w = new WalWriter();
  l.block(bot.body);
  // Studio wants every webStart closed (round 10); A360 leaves the browser open, so does this.
  for (const name of l.state.browsers)
    l.w.line(`webClose --name ${name} --leavebrowseropen`, {
      kind: 'verify',
      assumption: 'W-18',
      text: 'webClose --leavebrowseropen (Close Browser)',
    });
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
  const init = l.variables(bot.variables);
  const system = [...systemNames(bot)].flatMap((n) => systemValues[n]?.init ?? []);
  const helperDefs = [...l.helperVars, ...system.filter((x) => x.startsWith('defVar'))];
  if (helperDefs.length) {
    out.comment('---- Helper variables added by the conversion ----');
    for (const d of helperDefs) out.line(d);
  }
  // Every defVar is above this point: Studio rejects a defVar after a command (round 2).
  const startup = system.filter((x) => !x.startsWith('defVar'));
  if (init.length || startup.length) {
    out.comment('---- Initial values ----');
    for (const f of init) f();
    for (const cmd of startup) out.line(cmd);
  }

  out.append(body);
  if (l.subs.length) {
    out.comment('---- Subroutines added by the conversion (A360 Try/Catch) ----');
    for (const s of l.subs) out.append(s);
  }
  return { fileName: `${bot.name}.wal`, text: out.toString(), notes: out.notes };
}
