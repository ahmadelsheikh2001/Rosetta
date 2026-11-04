import type {
  BinaryOp,
  Block,
  Bot,
  Diagnostic,
  Expr,
  IRType,
  OpName,
  Severity,
  SourceRef,
  Statement,
  Variable,
  VarRefExpr,
} from '@rosetta/ir';
import { rebuildTables } from './tables.js';
import { parseCommand, unquote, type WalCommand } from './tokens.js';
import { walValue } from './values.js';

/** Reading problems, one code per kind. Messages live in the report catalog (`lift.wal.*`). */
export const WalCode = {
  Parse: 'WAL-PARSE',
  Structure: 'WAL-STRUCTURE',
  Unsupported: 'WAL-UNSUPPORTED',
  VariableType: 'WAL-VARIABLE-TYPE',
} as const;
export type WalCode = (typeof WalCode)[keyof typeof WalCode];

export const walMessageIds: Readonly<Record<WalCode, string>> = {
  'WAL-PARSE': 'lift.wal.parse',
  'WAL-STRUCTURE': 'lift.wal.structure',
  'WAL-UNSUPPORTED': 'lift.wal.unsupported',
  'WAL-VARIABLE-TYPE': 'lift.wal.variableType',
};

/** Registry lookup by WAL verb, injected by the caller (ADR-002). */
export type WalLookup = (
  verb: string,
) => { readonly id: string; readonly irOp?: string } | undefined;

export interface WalReadOptions {
  /** Path shown in reports, forward slashes. */
  readonly file: string;
  /** Bot name; a script carries none (its file name is used). */
  readonly name: string;
  readonly lookup?: WalLookup;
}

export interface WalReadResult {
  readonly bot: Bot;
  readonly diagnostics: readonly Diagnostic[];
}

/** WAL type names → IR types (defVar `--type`, verified/documented in docs/formats/wal-30.0.2.md). */
const types: Readonly<Record<string, IRType>> = {
  String: { kind: 'string' },
  Numeric: { kind: 'number' },
  Boolean: { kind: 'boolean' },
  DateTime: { kind: 'datetime' },
  DataTable: { kind: 'table' },
  SecureString: { kind: 'credential' },
  Excel: { kind: 'handle', resource: 'excel' },
  Browser: { kind: 'handle', resource: 'browser' },
  DbConnection: { kind: 'handle', resource: 'database' },
  // a PDF opened with pdfOpen (A360 reads the file by path)
  Pdf: { kind: 'handle', resource: 'file' },
  // key-value entry of a StringDictionary in a foreach (documented collection type)
  StringKeyValuePair: { kind: 'any' },
};

/** Conditional operators (documented options of `if`, `while`, `loopWhile`). */
const operators: Readonly<Record<string, BinaryOp>> = {
  Equal_To: 'eq',
  Not_Equal_To: 'ne',
  Greater_Than: 'gt',
  Less_Than: 'lt',
  Greater_Than_Equal_To: 'ge',
  Less_Than_Equal_To: 'le',
};
const predicates: Readonly<Record<string, string>> = {
  Contains: 'string.contains',
  Begins_With: 'string.startsWith',
  Ends_With: 'string.endsWith',
  Matches: 'string.matches',
  Is_Empty: 'is.empty',
  Is_Null: 'is.null',
  Is_Null_Or_Empty: 'is.nullOrEmpty',
};

/** Comment lines RPA Rosetta writes itself (banner, section markers); not part of the bot. */
const generated =
  /^\/\/ (=+|(Bot|Description|Source|Converted|Generator|Inputs|Outputs|Status): .*|---- (Helper variables|Initial values|Subroutines) added by the conversion.*|---- Initial values ----)$/;

const DISABLED = '// [DISABLED] ';

/** Inlined lines one subroutine may add over all its calls before it is written once only. */
const SHARED_SUBROUTINE_LINES = 2000;

/**
 * How target-wal writes an A360 Try (ADR-020): `goSub TryN`, whose subroutine starts with this
 * comment and `onError --label CatchN`; the Catch subroutine sets the `rosettaTryNFailed` flag,
 * which guards the Try body, and ends with `recover`. Finally commands follow the `goSub`
 * between the two Finally comments.
 */
const TRY_COMMENT = '// A360 Try (';
const CATCH_COMMENT = /^\/\/ A360 Catch \((.*)\)$/;
const FINALLY = '// A360 Finally: ';
const FINALLY_END = '// A360 Finally end';
const STEP_MARKER = /^\/\/ ---- .* ----$/;
const TRY_FLAG = /^"\$\{rosettaTry\d+Failed\}"$/;
const ERROR_MESSAGE = /^setVar --name "\$\{(\w+)\}" --value "\$\{rpa:errorMessage\}"$/;
const ERROR_LINE = /^setVar --name "\$\{(\w+)\}" --value \$\{rpa:errorLineNumber\}$/;

interface Line {
  /** 1-based line number. */
  readonly n: number;
  readonly text: string;
}

class Reader {
  readonly diagnostics: Diagnostic[] = [];
  readonly variables: Variable[] = [];
  /** WAL type name of each declared variable (`StringKeyValuePair` has no IR type of its own). */
  readonly walTypes = new Map<string, string>();
  private readonly subs = new Map<string, Line[]>();
  private readonly inlining: string[] = [];
  private readonly sizes = new Map<string, number>();
  private calls: Map<string, number> | undefined;
  private readonly copies = new Map<string, number>();
  private mainLines: Line[] = [];
  /** Shared subroutines already written at their first call. */
  private readonly writtenOnce = new Set<string>();

  constructor(private readonly options: WalReadOptions) {}

  ref(n: number, label?: string): SourceRef {
    return {
      platform: 'ibm-rpa',
      file: this.options.file,
      nodePath: n > 0 ? [n - 1] : [],
      ...(n > 0 ? { nodeId: `L${n}` } : {}),
      ...(label ? { label } : {}),
    };
  }

  report(code: WalCode, severity: Severity, params: Record<string, string | number>, n = 0): void {
    const at = this.ref(n);
    this.diagnostics.push({
      code,
      severity,
      category: code === WalCode.Parse ? 'parse' : 'unmapped',
      messageId: walMessageIds[code],
      params,
      source: at,
      ...(at.nodeId ? { nodeId: at.nodeId } : {}),
    });
  }

  /** Splits off subroutine blocks (`beginSub … endSub`); they are inlined where they are called. */
  read(text: string): Block {
    const main: Line[] = [];
    let sub: { name: string; lines: Line[] } | undefined;
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = { n: i + 1, text: raw.trim() };
      if (line.text === '') return;
      const verb = line.text.split(/\s/)[0];
      if (verb === 'beginSub') {
        const name = unquote(String(parseCommand(line.text)?.params.get('name') ?? ''));
        if (sub) this.report(WalCode.Structure, 'warning', { line: line.n, verb }, line.n);
        sub = { name, lines: [] };
        return;
      }
      if (verb === 'endSub' && sub) {
        this.subs.set(sub.name, sub.lines);
        sub = undefined;
        return;
      }
      (sub ? sub.lines : main).push(line);
    });
    if (sub) this.report(WalCode.Structure, 'warning', { line: 0, verb: 'beginSub' });
    this.mainLines = main;
    return steps(new Parser(this, main).parse(new Set()).block);
  }

  /** Lines a subroutine becomes when every goSub inside it is inlined too (memoised). */
  private expandedSize(name: string, stack: string[] = []): number {
    const known = this.sizes.get(name);
    if (known !== undefined) return known;
    if (stack.includes(name)) return 0;
    let size = 0;
    for (const line of this.subs.get(name) ?? []) {
      size++;
      const called = /^goSub --label (\S+)/.exec(line.text)?.[1];
      if (called) size += this.expandedSize(unquote(called), [...stack, name]);
    }
    this.sizes.set(name, size);
    return size;
  }

  /** How often each subroutine is called in the whole script (static count of goSub lines). */
  private callCount(name: string): number {
    if (!this.calls) {
      this.calls = new Map();
      for (const line of [...this.mainLines, ...[...this.subs.values()].flat()]) {
        const called = /^goSub --label (\S+)/.exec(line.text)?.[1];
        if (called) this.calls.set(unquote(called), (this.calls.get(unquote(called)) ?? 0) + 1);
      }
    }
    return this.calls.get(name) ?? 0;
  }

  /**
   * How many copies of a subroutine inlining would write: a call from the main flow is one copy,
   * a call from another subroutine is one per copy of that subroutine (memoised). Counting only
   * the goSub lines missed this: RPA.wal calls ErrorHandel from about 20 places, but those sit in
   * subroutines that are themselves inlined, so it was written 105 times (a 19 MB A360 bot).
   * A caller that is itself written once (see `isShared`) adds one copy only.
   */
  private copyCount(name: string, stack: string[] = []): number {
    const known = this.copies.get(name);
    if (known !== undefined) return known;
    if (stack.includes(name)) return 0;
    let count = 0;
    const calls = (lines: readonly Line[]) =>
      lines.filter((l) => unquote(/^goSub --label (\S+)/.exec(l.text)?.[1] ?? '') === name).length;
    count += calls(this.mainLines);
    for (const [caller, lines] of this.subs) {
      const n = calls(lines);
      if (n === 0) continue;
      const inner = [...stack, name];
      count += n * (this.isShared(caller, inner) ? 1 : this.copyCount(caller, inner));
    }
    this.copies.set(name, count);
    return count;
  }

  /** Whether a subroutine is written once and its other calls only point to it. */
  private isShared(name: string, stack: string[] = []): boolean {
    const copies = this.copyCount(name, stack);
    return copies > 1 && this.expandedSize(name) * copies > SHARED_SUBROUTINE_LINES;
  }

  subroutine(name: string, n: number): Statement {
    const lines = this.subs.get(name);
    if (!lines || this.inlining.includes(name)) {
      this.report(WalCode.Unsupported, 'warning', { verb: 'goSub', detail: name }, n);
      return unknown(this, n, `goSub --label ${name}`, 'subroutine not found or recursive');
    }
    // A target without subroutines gets each call's steps in place. A long subroutine called
    // from many places would multiply the bot (one real script grew past a million lines), so it
    // is written once, at its first call; the other calls say where it is.
    const size = this.expandedSize(name);
    const calls = this.callCount(name);
    if (this.isShared(name)) {
      if (this.writtenOnce.has(name)) {
        return {
          id: `L${String(n)}`,
          source: this.ref(n, `goSub ${name}`),
          kind: 'unknown',
          raw: `goSub --label ${name}`,
          reason: `Subroutine ${name} runs here (${String(size)} lines, called ${String(calls)} times): its steps are written once, at its first call. Make it a task bot of its own and run it here with Run Task Bot.`,
        };
      }
      this.writtenOnce.add(name);
    }
    this.inlining.push(name);
    try {
      if (lines[0]?.text.startsWith(TRY_COMMENT)) return this.tryOf(name, lines.slice(1), n);
      return {
        id: `L${n}`,
        source: this.ref(n, `goSub ${name}`),
        kind: 'group',
        label: `Subroutine ${name}`,
        body: new Parser(this, lines).parse(new Set()).block,
      };
    } finally {
      this.inlining.pop();
    }
  }

  hasSub(name: string): boolean {
    return this.subs.has(name);
  }

  /**
   * `onError --label H` set by the script: the statements after it in the same block, guarded by
   * the subroutine H. A trailing `recover` means "go on after the failing command", which A360
   * cannot do: the Catch ends the Try instead, and a comment says so.
   */
  handlerTry(name: string, body: Statement[], n: number): Statement {
    const lines = this.subs.get(name) ?? [];
    const recovers = lines.at(-1)?.text === 'recover';
    this.inlining.push(name);
    try {
      const handler = new Parser(this, recovers ? lines.slice(0, -1) : lines).parse(
        new Set(),
      ).block;
      const note: Statement = {
        id: `L${String(n)}c`,
        source: this.ref(n, `onError ${name}`),
        kind: 'comment',
        text: recovers
          ? `WAL error handler ${name}: WAL went on after the failing command (recover); A360 leaves the Try here`
          : `WAL error handler ${name}`,
      };
      return {
        id: `L${String(n)}`,
        source: this.ref(n, `onError ${name}`),
        kind: 'try',
        body,
        catches: [{ body: [note, ...handler] }],
      };
    } finally {
      this.inlining.pop();
    }
  }

  /** True for a Catch subroutine written by target-wal: it sets a `rosettaTryNFailed` flag. */
  isCatch(name: string): boolean {
    return (this.subs.get(name) ?? []).some((l) =>
      TRY_FLAG.test(String(parseCommand(l.text)?.params.get('name') ?? '')),
    );
  }

  /** A Try subroutine and its Catch subroutine (ADR-020) → an IR try; Finally is added by the caller. */
  private tryOf(name: string, lines: readonly Line[], n: number): Statement {
    const handler = parseCommand(lines[0]?.text ?? '');
    const catchName =
      handler?.verb === 'onError' ? unquote(String(handler.params.get('label') ?? '')) : '';
    const body = new Parser(this, lines).parse(new Set()).block;
    const catchLines = this.subs.get(catchName);
    if (!catchLines)
      return { id: `L${n}`, source: this.ref(n, `goSub ${name}`), kind: 'try', body, catches: [] };
    let errorType: string | undefined;
    let errorVar: VarRefExpr | undefined;
    let lineVar: VarRefExpr | undefined;
    const rest = catchLines.filter((l) => {
      const type = CATCH_COMMENT.exec(l.text);
      const message = ERROR_MESSAGE.exec(l.text);
      const line = ERROR_LINE.exec(l.text);
      if (type) errorType = type[1] === 'all errors' ? undefined : type[1];
      else if (message) errorVar = { kind: 'var', name: message[1] ?? '', path: [] };
      else if (line) lineVar = { kind: 'var', name: line[1] ?? '', path: [] };
      else return l.text !== 'recover';
      return false;
    });
    return {
      id: `L${n}`,
      source: this.ref(n, `goSub ${name}`),
      kind: 'try',
      body,
      catches: [
        {
          body: new Parser(this, rest).parse(new Set()).block,
          ...(errorType ? { errorType } : {}),
          ...(errorVar ? { errorVar } : {}),
          ...(lineVar ? { lineVar } : {}),
        },
      ],
    };
  }

  declare(cmd: WalCommand, n: number): void {
    const name = unquote(String(cmd.params.get('name') ?? ''));
    const typeName = unquote(String(cmd.params.get('type') ?? ''));
    const inner = types[unquote(String(cmd.params.get('innertype') ?? 'String'))] ?? {
      kind: 'any',
    };
    let type: IRType | undefined = types[typeName];
    if (typeName === 'List') type = { kind: 'list', of: inner };
    if (typeName === 'StringDictionary') type = { kind: 'dict', of: inner };
    if (!type) {
      this.report(WalCode.VariableType, 'warning', { variable: name, type: typeName }, n);
      type = { kind: 'unknown', sourceType: typeName };
    }
    const input = cmd.params.has('parameter');
    const output = cmd.params.has('output');
    const value = cmd.params.get('value');
    let defaultValue: Expr | undefined;
    if (value !== undefined) {
      const listText = typeof value === 'string' ? /^"\[(.*)\]"$/.exec(value) : null;
      defaultValue =
        type.kind === 'list' && listText
          ? {
              kind: 'call',
              fn: 'list.of',
              args: (listText[1] ?? '')
                .split(',')
                .filter((x) => x !== '')
                .map((x) => ({ kind: 'literal', value: x })),
            }
          : walValue(value);
    }
    this.walTypes.set(name, typeName);
    this.variables.push({
      name,
      type,
      direction: input && output ? 'inout' : input ? 'input' : output ? 'output' : 'local',
      sensitive: type.kind === 'credential',
      ...(defaultValue ? { defaultValue } : {}),
      source: this.ref(n, 'defVar'),
    });
  }

  lookup(verb: string) {
    return this.options.lookup?.(verb);
  }
}

/**
 * RPA Rosetta writes an A360 Step as a `// ---- title ----` comment before its commands
 * (target-wal). At the top level, each such marker starts a group that runs to the next one.
 */
function steps(block: Statement[]): Statement[] {
  const out: Statement[] = [];
  let group: { id: string; source?: SourceRef; label: string; body: Statement[] } | undefined;
  for (const s of block) {
    const marker = s.kind === 'comment' ? /^---- (.*) ----$/.exec(s.text) : null;
    if (marker) {
      if (group) out.push({ ...group, kind: 'group' });
      group = {
        id: s.id,
        ...(s.source ? { source: s.source } : {}),
        label: marker[1] ?? '',
        body: [],
      };
    } else if (group) {
      group.body.push(s);
    } else {
      out.push(s);
    }
  }
  if (group) out.push({ ...group, kind: 'group' });
  return out;
}

function unknown(r: Reader, n: number, text: string, reason: string): Statement {
  return { id: `L${n}`, source: r.ref(n, text.split(' ')[0]), kind: 'unknown', raw: text, reason };
}

const varOf = (raw: string | true | undefined): VarRefExpr | undefined => {
  const e = raw === undefined ? undefined : walValue(raw);
  return e?.kind === 'var' && e.path.length === 0 ? e : undefined;
};

/** `--left L --operator "Op" --right R [--negate]` → IR condition. */
function condition(cmd: WalCommand): Expr {
  const left = walValue(cmd.params.get('left') ?? '""');
  const right = walValue(cmd.params.get('right') ?? '""');
  const op = unquote(String(cmd.params.get('operator') ?? ''));
  const negate = cmd.params.has('negate');
  let expr: Expr;
  if (op === 'Is_True') {
    return { kind: 'binary', op: 'eq', left, right: { kind: 'literal', value: !negate } };
  } else if (operators[op]) {
    expr = { kind: 'binary', op: operators[op], left, right };
  } else if (predicates[op]) {
    const fn = predicates[op];
    expr = { kind: 'call', fn, args: fn.startsWith('is.') ? [left] : [left, right] };
  } else {
    expr = { kind: 'raw', text: op, dialect: 'ibm-rpa', reason: `operator ${op}` };
  }
  return negate ? { kind: 'unary', op: 'not', operand: expr } : expr;
}

/** Parses a run of lines up to one of the `stop` verbs; nested blocks recurse. */
class Parser {
  private pos = 0;

  constructor(
    private readonly r: Reader,
    private readonly lines: readonly Line[],
  ) {}

  /** `inFinally`: also ends at the Finally end comment (consumed) or a Step marker (not consumed). */
  parse(
    stop: ReadonlySet<string>,
    inFinally = false,
  ): { block: Statement[]; end?: { verb: string; line: Line } } {
    const block: Statement[] = [];
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos++];
      if (!line) break;
      const n = line.n;
      if (inFinally && line.text === FINALLY_END) return { block };
      if (inFinally && STEP_MARKER.test(line.text)) {
        this.pos--;
        return { block };
      }
      if (line.text.startsWith(DISABLED)) {
        // RPA Rosetta keeps disabled A360 code as `// [DISABLED] <command>` lines (target-wal):
        // read the run of such lines as code and mark it disabled.
        const run: Line[] = [{ n, text: line.text.slice(DISABLED.length) }];
        while (this.lines[this.pos]?.text.startsWith(DISABLED)) {
          const next = this.lines[this.pos++];
          if (next) run.push({ n: next.n, text: next.text.slice(DISABLED.length) });
        }
        for (const s of new Parser(this.r, run).parse(new Set()).block)
          block.push({ ...s, disabled: true });
        continue;
      }
      if (line.text.startsWith('//')) {
        if (!generated.test(line.text))
          block.push({
            id: `L${n}`,
            source: this.r.ref(n),
            kind: 'comment',
            text: line.text.slice(2).trim(),
          });
        continue;
      }
      const cmd = parseCommand(line.text);
      if (!cmd) {
        this.r.report(WalCode.Parse, 'error', { line: n }, n);
        block.push(unknown(this.r, n, line.text, 'unterminated quoted value'));
        continue;
      }
      if (stop.has(cmd.verb)) return { block, end: { verb: cmd.verb, line } };
      // A handler the script sets itself watches the rest of the block: a Try around it whose
      // Catch is the handler subroutine (the reverse of ADR-020)
      const handler = cmd.verb === 'onError' ? unquote(String(cmd.params.get('label') ?? '')) : '';
      if (handler && !this.r.isCatch(handler) && this.r.hasSub(handler)) {
        const rest = this.parse(stop, inFinally);
        block.push(this.r.handlerTry(handler, rest.block, n));
        return rest.end ? { block, end: rest.end } : { block };
      }
      const s = this.statement(cmd, line);
      if (s?.kind === 'try') {
        // a nested Try restores the enclosing handler right after its goSub
        for (let next = this.lines[this.pos]; next; next = this.lines[this.pos]) {
          const c = parseCommand(next.text);
          if (
            c?.verb !== 'onError' ||
            !this.r.isCatch(unquote(String(c.params.get('label') ?? '')))
          )
            break;
          this.pos++;
        }
      }
      if (s?.kind === 'try' && this.lines[this.pos]?.text.startsWith(FINALLY)) {
        this.pos++;
        const r = this.parse(stop, true);
        block.push({ ...s, finally: r.block });
        if (r.end) return { block, end: r.end };
        continue;
      }
      if (s) block.push(s);
    }
    if (stop.size > 0)
      this.r.report(WalCode.Structure, 'warning', { line: 0, verb: [...stop].join('/') });
    return { block };
  }

  private statement(cmd: WalCommand, line: Line): Statement | undefined {
    const n = line.n;
    const base = { id: `L${n}`, source: this.r.ref(n, `${cmd.verb} @ line ${n}`) };
    switch (cmd.verb) {
      case 'defVar':
        this.r.declare(cmd, n);
        return undefined;
      case 'setVar':
        // the Try flag of ADR-020 is part of the Try, not of the bot
        if (TRY_FLAG.test(String(cmd.params.get('name') ?? ''))) return undefined;
        return this.action(cmd, base);
      case 'if': {
        if (TRY_FLAG.test(String(cmd.params.get('left') ?? ''))) {
          // `if flag / return / endIf`: leaves the Try body after an error (ADR-020)
          while (this.pos < this.lines.length && this.lines[this.pos]?.text !== 'endIf') this.pos++;
          this.pos++;
          return undefined;
        }
        const branches = [{ condition: condition(cmd), body: [] as Statement[] }];
        let elseBody: Statement[] | undefined;
        let r = this.parse(new Set(['elseIf', 'else', 'endIf']));
        branches[0] = { condition: condition(cmd), body: r.block };
        while (r.end?.verb === 'elseIf') {
          const c = parseCommand(r.end.line.text);
          r = this.parse(new Set(['elseIf', 'else', 'endIf']));
          if (c) branches.push({ condition: condition(c), body: r.block });
        }
        if (r.end?.verb === 'else') {
          r = this.parse(new Set(['endIf']));
          elseBody = r.block;
        }
        return { ...base, kind: 'if', branches, ...(elseBody ? { else: elseBody } : {}) };
      }
      case 'for': {
        const body = this.parse(new Set(['next'])).block;
        const from = walValue(cmd.params.get('from') ?? '1');
        const step = walValue(cmd.params.get('step') ?? '1');
        const index = varOf(cmd.params.get('variable'));
        const one = (e: Expr) => e.kind === 'literal' && e.value === 1;
        if (!one(from) || !one(step)) {
          this.r.report(
            WalCode.Unsupported,
            'warning',
            { verb: 'for', detail: 'from/step other than 1' },
            n,
          );
          return {
            ...unknown(this.r, n, line.text, 'for with from/step other than 1'),
            body,
          } as Statement;
        }
        return {
          ...base,
          kind: 'loop',
          loop: {
            kind: 'times',
            count: walValue(cmd.params.get('to') ?? '0'),
            ...(index ? { indexVar: index } : {}),
          },
          body,
        };
      }
      case 'foreach': {
        const body = this.parse(new Set(['endFor'])).block;
        const item = varOf(cmd.params.get('variable'));
        if (!item)
          return {
            ...unknown(this.r, n, line.text, 'foreach without a variable'),
            body,
          } as Statement;
        const source = walValue(cmd.params.get('collection') ?? '""');
        if (this.r.walTypes.get(item.name) === 'StringKeyValuePair') {
          // A foreach over a StringDictionary yields key-value entries. When the body starts by
          // taking the entry's key (`setVar --name "${k}" --value "${entry.Key}"`, as RPA Rosetta
          // writes an A360 dictionary-keys loop), it is a loop over the keys.
          const [first, ...rest] = body;
          const value = first?.kind === 'action' ? first.args.value : undefined;
          const key =
            first?.kind === 'action' && first.op === 'vendor:ibm-rpa/setVar'
              ? first.args.name
              : undefined;
          const takesKey =
            value?.kind === 'var' &&
            value.name === item.name &&
            value.path.length === 1 &&
            value.path[0]?.kind === 'key' &&
            JSON.stringify(value.path[0].key) === JSON.stringify({ kind: 'literal', value: 'Key' });
          if (takesKey && key?.kind === 'var' && key.path.length === 0)
            return {
              ...base,
              kind: 'loop',
              loop: { kind: 'forEach', collection: 'dictKeys', source, itemVar: key },
              body: rest,
            };
          return {
            ...base,
            kind: 'loop',
            loop: { kind: 'forEach', collection: 'dict', source, itemVar: item },
            body,
          };
        }
        return {
          ...base,
          kind: 'loop',
          loop: {
            kind: 'forEach',
            collection: 'list',
            source,
            itemVar: item,
          },
          body,
        };
      }
      case 'case': {
        // `case --switches Any|All`, then `when` conditions up to `then`, then the body up to
        // `endCase` (a script saved by Studio 30.0.2): one if whose conditions are joined with
        // or (Any) / and (All)
        const conditions: Expr[] = [];
        while (this.pos < this.lines.length) {
          const next = this.lines[this.pos];
          const c = next ? parseCommand(next.text) : undefined;
          if (next?.text.startsWith('//')) {
            this.pos++;
            continue;
          }
          if (c?.verb !== 'when') break;
          conditions.push(condition(c));
          this.pos++;
        }
        if (parseCommand(this.lines[this.pos]?.text ?? '')?.verb === 'then') this.pos++;
        const body = this.parse(new Set(['endCase'])).block;
        const join = /All/i.test(unquote(String(cmd.params.get('switches') ?? 'Any')))
          ? 'and'
          : 'or';
        const [first, ...rest] = conditions;
        if (!first)
          return {
            ...base,
            kind: 'group',
            label: `case ${unquote(String(cmd.params.get('name') ?? ''))}`,
            body,
          };
        const joined = rest.reduce<Expr>(
          (left, right) => ({ kind: 'binary', op: join, left, right }),
          first,
        );
        return { ...base, kind: 'if', branches: [{ condition: joined, body }] };
      }
      case 'while': {
        const body = this.parse(new Set(['endWhile'])).block;
        return { ...base, kind: 'loop', loop: { kind: 'while', condition: condition(cmd) }, body };
      }
      case 'do': {
        const r = this.parse(new Set(['loopWhile']));
        const c = r.end ? parseCommand(r.end.line.text) : undefined;
        return {
          ...base,
          kind: 'loop',
          loop: {
            kind: 'while',
            condition: c ? condition(c) : { kind: 'literal', value: false },
            checkAtEnd: true,
          },
          body: r.block,
        };
      }
      case 'break':
      case 'continue':
        return { ...base, kind: cmd.verb };
      case 'failTest':
        return {
          ...base,
          kind: 'throw',
          message: walValue(cmd.params.get('message') ?? '""'),
          category: 'system',
        };
      case 'goSub':
        return this.r.subroutine(unquote(String(cmd.params.get('label') ?? '')), n);
      case 'onError':
        // setting or restoring the handler of a Try (ADR-020) is part of the Try
        if (this.r.isCatch(unquote(String(cmd.params.get('label') ?? '')))) return undefined;
        return this.notHere(cmd, line);
      case 'recover':
      case 'return':
      case 'endIf':
      case 'next':
      case 'endFor':
      case 'endWhile':
      case 'loopWhile':
      case 'elseIf':
      case 'else':
        return this.notHere(cmd, line);
      default:
        return this.action(cmd, base);
    }
  }

  private notHere(cmd: WalCommand, line: Line): Statement {
    this.r.report(WalCode.Unsupported, 'warning', { verb: cmd.verb, detail: line.text }, line.n);
    return unknown(this.r, line.n, line.text, `${cmd.verb} not understood here`);
  }

  private action(cmd: WalCommand, base: { id: string; source: SourceRef }): Statement {
    const args: Record<string, Expr> = {};
    for (const [k, v] of cmd.params) args[k] = walValue(v);
    const outputs: Record<string, VarRefExpr> = {};
    for (const o of cmd.outputs) outputs[o.output] = { kind: 'var', name: o.variable, path: [] };
    const mapping = this.r.lookup(cmd.verb);
    const op = (mapping?.irOp ?? `vendor:ibm-rpa/${cmd.verb}`) as OpName;
    return {
      ...base,
      kind: 'action',
      op,
      args,
      outputs,
      ...(mapping ? { mappingId: mapping.id } : {}),
    };
  }
}

/** Reads one IBM RPA WAL script into IR. Never throws on bad input. */
export function readWal(text: string, options: WalReadOptions): WalReadResult {
  const r = new Reader(options);
  const { body, variables } = rebuildTables(
    r.read(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text),
    r.variables,
  );
  return {
    bot: {
      id: options.file,
      name: options.name,
      source: r.ref(0),
      variables,
      packages: [],
      body,
    },
    diagnostics: r.diagnostics,
  };
}
