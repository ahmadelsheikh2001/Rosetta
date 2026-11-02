import { readFileSync } from 'node:fs';
import type { ActionStmt, Expr } from '@rosetta/ir';
import { pathOf, textOf, valueOf, type NoteSink } from './expr.js';
import { quote } from './syntax.js';
import { checkWal } from './check.js';
import type { LowerState } from './commands.js';
import type { NoteInput, WalWriter } from './writer.js';

/**
 * Fallback conversion for A360 commands that have no hand-written lowerer (tiers 2-4):
 *
 * - tier 2 `draft`: one IBM command generated from the mapping dictionary v2 rules
 *   (target verb, parameter map, enum maps, required defaults);
 * - tier 3 `template`: an `httpRequest` skeleton for SaaS / REST commands (PATTERN);
 * - tier 4 `stub`: everything else gets a typed stub subroutine (see {@link stubFor}).
 *
 * Rules come from `data/a360-ibm-rules.json` (built by `scripts/build-wal-rules.py`, A-27).
 * Nothing produced here is verified in Studio: every line carries a `verify` or `manual` note.
 */

/** [IBM parameter, dictionary rule, note] per A360 attribute path. */
type ParamRule = readonly [string, string, string];

export interface ConversionRule {
  /** Dictionary strategy: NATIVE, COMPOSITE, PATTERN, WORKAROUND, PLATFORM, ... */
  readonly s: string;
  /** Dictionary target text. */
  readonly t: string;
  /** IBM verbs in the target that exist in the 30.0.x catalog. */
  readonly v?: readonly string[];
  readonly p?: Readonly<Record<string, ParamRule>>;
  /** Required IBM parameters with no A360 source → default value. */
  readonly d?: Readonly<Record<string, string>>;
  /** Enum maps per A360 attribute path: A360 option → IBM value. */
  readonly e?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface IbmCommand {
  /** Parameter → type; `null` when the verb exists but its parameters were not captured. */
  readonly p: Readonly<Record<string, string>> | null;
  readonly o: Readonly<Record<string, string>>;
}

const read = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));

let rulesCache: Readonly<Record<string, ConversionRule>> | undefined;
let catalogCache: Readonly<Record<string, IbmCommand>> | undefined;

/** Conversion rules by `Package/command`. */
export function conversionRules(): Readonly<Record<string, ConversionRule>> {
  rulesCache ??= read('a360-ibm-rules.json') as Record<string, ConversionRule>;
  return rulesCache;
}

/** IBM RPA 30.0.x command catalog (reference, not Studio-verified). */
export function ibmCatalog(): Readonly<Record<string, IbmCommand>> {
  catalogCache ??= read('ibm-catalog-30.json') as Record<string, IbmCommand>;
  return catalogCache;
}

let requiredCache: Readonly<Record<string, readonly string[]>> | undefined;

/** Required parameters per IBM command, from the 30.0.x reference (Boolean flags left out). */
export function requiredParams(): Readonly<Record<string, readonly string[]>> {
  requiredCache ??= read('ibm-required-30.json') as Record<string, readonly string[]>;
  return requiredCache;
}

/** Defaults for required parameters A360 has no attribute for (Studio-verified where noted). */
const requiredDefaults: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // golden corpus, rounds 2 and 4
  messageBox: { icon: 'Information', buttons: 'OK', defaultbutton: 'FirstButton' },
  getCurrentDateAndTime: { localorutc: 'LocalTime' },
  getEnvVar: { target: 'Process' },
  // round 2: "Number" is rejected
  convertNumberToText: { conversiontype: 'SimpleNumber' },
  logMessage: { type: 'Info' },
};

/** `vendor:a360/<Package>/<command>` → `Package/command`. */
export function sourceKey(a: ActionStmt): string | undefined {
  const m = /^vendor:a360\/(.+)$/.exec(a.op);
  if (m?.[1]) return m[1];
  // A mapped command whose IR op has no lowerer: the source label is `package/command`.
  const label = a.source?.label;
  return label && /^[^/\s]+\/[^/]+$/.test(label) ? label : undefined;
}

/** Strategies a single generated IBM command can stand for. */
const draftable = new Set([
  'NATIVE',
  'COMPOSITE',
  'CONDITION',
  'VARIABLE',
  'PROPERTY',
  'SYSTEM_VAR',
  'ITERATOR',
  'TRANSFORM',
]);
/** Verbs that open a block: never written for a single A360 action. */
const blockVerbs = new Set([
  'if',
  'elseIf',
  'while',
  'for',
  'foreach',
  'do',
  'loopWhile',
  'beginSub',
]);
/** Dictionary rules whose attribute maps straight onto the IBM parameter. */
const passRules = new Set(['DIRECT', 'AUTO', 'ENUM_MAP', 'TIMESPAN', 'TO_LIST', 'TRANSFORM']);

const draftNote = (key: string, rule: ConversionRule): NoteInput => ({
  kind: 'verify',
  assumption: 'A-27',
  text: `${key}: generated from the mapping dictionary (${rule.s} → ${rule.t}); not verified in Studio`,
});

/** Strips the option-branch part of a lifted attribute path. */
const normPath = (k: string): string => k.replace(/\[[^\]]*\]/g, '');

const literal = (e: Expr | undefined): string | number | boolean | null | undefined =>
  e?.kind === 'literal' ? e.value : undefined;

/** Seconds → `hh:mm:ss` (TimeSpan text). */
function timeSpan(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** WAL text for one value, shaped by the IBM parameter type. */
function render(e: Expr, type: string | undefined, sink: NoteSink): string | true | undefined {
  const t = (type ?? 'String').toLowerCase();
  if (t === 'boolean') {
    const v = literal(e);
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false' || v === '' || v === null) return undefined;
    return valueOf(e, sink);
  }
  if (t === 'numeric' || t === 'number')
    return e.kind === 'var' ? textOf(e, sink) : valueOf(e, sink);
  if (t === 'string' || t.startsWith('text')) {
    // A360 file pickers store `file:///C:/...` URIs; IBM wants a Windows path
    if (e.kind === 'literal' && typeof e.value === 'string' && e.value.startsWith('file://'))
      return pathOf(e, sink);
    return quote(textOf(e, sink));
  }
  return valueOf(e, sink);
}

/** Session handle helper for sessions opened by generated commands, per package + name. */
function sessionHandle(pkg: string, a: ActionStmt, s: LowerState, type?: string): string {
  const name = literal(a.args.session);
  const raw = `${pkg} ${name === undefined || name === null ? 'Default' : String(name)}`;
  const key = `session${raw
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/(?:^|\s)(\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/\s/g, '')}`;
  return s.helper(key, (n) => `defVar --name ${n} --type ${type ?? 'String'}`);
}

/**
 * IBM commands a rule stands for, in order: the first alternative of `a / b` (or `a | b`),
 * split on `+` into a sequence; optional extras in parentheses are dropped. `undefined` when
 * the sequence needs a block (loop, condition) or a verb is not in the catalog.
 */
export function draftVerbs(
  rule: ConversionRule,
): { verbs: string[]; alternatives: string[] } | undefined {
  const cat = ibmCatalog();
  if (rule.v?.length === 1) {
    const only = rule.v[0] ?? '';
    return cat[only] && !blockVerbs.has(only) ? { verbs: [only], alternatives: [] } : undefined;
  }
  const t = rule.t.replace(/\([^)]*\)/g, ' ');
  const alts = t
    .split(/\s(?:\/|\||or)\s/)
    .map((x) => x.trim())
    .filter(Boolean);
  const first = alts[0] ?? '';
  const verbs = first
    .split(/\s*\+\s*/)
    .map((x) => x.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
  if (!verbs.length || verbs.some((v) => !cat[v] || blockVerbs.has(v))) return undefined;
  return { verbs, alternatives: alts.slice(1) };
}

/**
 * Tier 2: writes the IBM command(s) for a NATIVE-like rule. A sequence (`a + b`) becomes one
 * line per command, each A360 attribute going to the first command that has its parameter.
 * Returns false when the rule cannot be expressed this way; nothing is written then.
 */
export function lowerDraft(a: ActionStmt, w: WalWriter, s: LowerState): boolean {
  const key = sourceKey(a);
  if (!key) return false;
  const rule = conversionRules()[key];
  if (!rule || !draftable.has(rule.s)) return false;
  const plan = draftVerbs(rule);
  if (!plan) return false;
  const cat = ibmCatalog();
  const owner = (ibm: string): string | undefined =>
    plan.verbs.find((v) => {
      const p = cat[v]?.p;
      return p !== null && p !== undefined && ibm in p;
    });
  const lines: { line: string; notes: NoteInput[] }[] = [];
  /** Object outputs of earlier steps (Pdf, Image, DataTable, ...) → helper variable. */
  const chain = new Map<string, string>();
  for (const [i, verb] of plan.verbs.entries()) {
    const owns =
      plan.verbs.length === 1 ? undefined : (ibm: string) => (owner(ibm) ?? plan.verbs[0]) === verb;
    const r = draftLine(a, s, key, rule, verb, owns, i === 0, i === plan.verbs.length - 1, chain);
    if (typeof r === 'string') {
      rejected.set(key, r);
      return false;
    }
    if (!r) return false;
    lines.push(r);
  }
  if (plan.alternatives.length)
    lines[0]?.notes.push({
      kind: 'semantic',
      text: `${key}: wrote ${plan.verbs.join(' + ')}; the dictionary also allows ${plan.alternatives.join(' / ')} - pick the one that fits the source`,
    });
  for (const r of lines) w.line(r.line, ...r.notes);
  return true;
}

/** One generated IBM command line, a rejection message from the checker, or undefined. */
function draftLine(
  a: ActionStmt,
  s: LowerState,
  key: string,
  rule: ConversionRule,
  verb: string,
  owns: ((ibm: string) => boolean) | undefined,
  first: boolean,
  last: boolean,
  chain = new Map<string, string>(),
): { line: string; notes: NoteInput[] } | string | undefined {
  const cmd = ibmCatalog()[verb];
  if (!cmd) return undefined;
  const pkg = key.split('/')[0] ?? '';
  const notes: NoteInput[] = [draftNote(key, rule)];
  const sink: NoteSink = (n) => notes.push(n);
  const parts: string[] = [verb];
  if (verb === 'setVar') {
    const target = a.outputs.result?.name;
    if (!target) return undefined;
    parts.push(`--name "\${${target}}"`);
  }
  const used = new Set<string>();
  const review: string[] = [];

  for (const [rawPath, expr] of Object.entries(a.args)) {
    const path = normPath(rawPath);
    // lifted option children may drop their parent path (`imagePath` for `imagePathOption.imagePath`)
    const suffix = Object.keys(rule.p ?? {}).filter((k) => k.endsWith(`.${path}`));
    const pr = rule.p?.[path] ?? (suffix.length === 1 ? rule.p?.[suffix[0] ?? ''] : undefined);
    if (!pr) {
      if (path !== 'session' && first) review.push(`${path} (no rule)`);
      continue;
    }
    const [ibm, how, note] = pr;
    if (how === 'INSTANCE' || path === 'session') continue;
    if (ibm && owns && !owns(ibm.replace(/^-+/, ''))) continue;
    if (ibm && passRules.has(how) && cmd.p !== null && !(ibm in cmd.p)) {
      // the dictionary names a parameter of a command this line does not write (e.g. smtpConnect)
      if (first) review.push(`${path}: --${ibm} is not a ${verb} parameter`);
      continue;
    }
    if (!ibm || !passRules.has(how)) {
      if (first && !['DROP', 'N/A', ''].includes(how))
        review.push(`${path} (${how}${note ? `: ${note}` : ''})`);
      continue;
    }
    if (used.has(ibm)) continue;
    let value: string | true | undefined;
    const type = cmd.p?.[ibm];
    if (how === 'ENUM_MAP') {
      const v = literal(expr);
      const mapped = v === undefined || v === null ? undefined : rule.e?.[path]?.[String(v)];
      if (mapped && mapped !== 'UNMAPPED') {
        value = quote(mapped.split(/ [(+]/)[0]?.trim() ?? mapped);
        if (/[(+]/.test(mapped)) review.push(`${path}: ${mapped}`);
      } else {
        value = render(expr, type, sink);
        review.push(`${path}: option ${String(v)} has no IBM value`);
      }
    } else if (how === 'TIMESPAN' && typeof literal(expr) !== 'object') {
      const n = Number(literal(expr));
      const ms = /unit=ms|milli/i.test(note);
      value = Number.isFinite(n) ? quote(timeSpan(ms ? n / 1000 : n)) : render(expr, type, sink);
      if (!Number.isFinite(n)) review.push(`${path}: convert to TimeSpan hh:mm:ss`);
    } else if (how === 'TRANSFORM' && literal(expr) === 'ALL') {
      continue; // "all pages / all items": the IBM default when the parameter is left out
    } else {
      value = render(expr, type, sink);
      if (how === 'TRANSFORM' || how === 'TO_LIST') review.push(`${path} (${how}: ${note})`);
    }
    if (value === undefined) continue;
    parts.push(value === true ? `--${ibm}` : `--${ibm} ${value}`);
    used.add(ibm);
  }

  // Session (instance) parameters: the command that opens a session returns the handle.
  const instanceParams = Object.values(rule.p ?? {}).filter(
    ([ibm, how]) => how === 'INSTANCE' && ibm,
  );
  const outType = Object.entries(cmd.o).find(([, t]) => !/^(String|Numeric|Boolean)$/.test(t));
  const opens =
    a.args.session !== undefined && outType !== undefined && instanceParams.length === 0;
  if (a.args.session !== undefined && !opens) {
    const declared = instanceParams[0]?.[0];
    const ibm =
      declared && (owns ? owns(declared) : true)
        ? declared
        : Object.keys(cmd.p ?? {}).find((p) =>
            /connection|file|session|window|browser|instance/i.test(p),
          );
    const mine =
      ibm !== undefined && (cmd.p === null || ibm in cmd.p) && (owns ? owns(ibm) : first);
    if (ibm && mine && !used.has(ibm)) {
      parts.push(`--${ibm} \${${sessionHandle(pkg, a, s)}}`);
      used.add(ibm);
      notes.push({
        kind: 'verify',
        text: `${key}: session "${String(literal(a.args.session) ?? 'Default')}" → --${ibm}; the opening command must return it`,
      });
    }
  }

  for (const [param, def] of Object.entries(rule.d ?? {})) {
    if (used.has(param)) continue;
    const bare = param.replace(/^-+/, '');
    if (owns ? !owns(bare) : cmd.p !== null && !(bare in cmd.p)) continue;
    if (/per endpoint|derive/i.test(def)) {
      parts.push(`--${param} "{{ROSETTA: ${param}}}"`);
      review.push(`--${param}: ${def}`);
    } else parts.push(`--${param} ${quote(def)}`);
    used.add(param);
  }

  // Outputs
  const outputs = Object.keys(cmd.o);
  const result = a.outputs.result?.name;
  const preferred = ['value', 'output', 'result', 'text'].find((o) => outputs.includes(o));
  if (verb === 'setVar') {
    // the target is --name
  } else if (!last) {
    // a step's object output (Pdf, Image, DataTable, ...) feeds the next step's matching input
    const obj = Object.entries(cmd.o).find(
      ([n, t]) => n === 'value' && !/^(String|Numeric|Boolean|Scalar)$/.test(t),
    );
    if (obj) {
      const h = s.helper(
        `chain${obj[1].replace(/\W/g, '')}${key.replace(/\W/g, '')}`,
        (n) => `defVar --name ${n} --type ${obj[1]}`,
      );
      parts.push(`${h}=value`);
      chain.set(obj[1], h);
    }
  } else if (opens) {
    parts.push(`${sessionHandle(pkg, a, s, outType[1])}=${outType[0]}`);
  } else if (result && preferred) {
    parts.push(`${result}=${preferred}`);
  } else if (result) {
    review.push(`result ${result}: ${verb} has no documented output`);
  }
  for (const [k, v] of Object.entries(last ? a.outputs : {})) {
    if (k === 'result') continue;
    if (outputs.includes(k)) parts.push(`${v.name}=${k}`);
    else review.push(`output ${k} → ${v.name}`);
  }
  if (review.length) notes.push({ kind: 'manual', text: `${key} review: ${review.join('; ')}` });
  // Required IBM parameters with no A360 source (reference list + static checker): written with a
  // sensible default or a visible {{ROSETTA: …}} placeholder instead of dropping the command.
  const filled: string[] = [];
  const fill = (m: string): void => {
    if (used.has(m)) return;
    const insert = (...xs: string[]) => {
      // inputs go before the `var=output` assignments at the end of the line
      const at = parts.findIndex((x, i) => i > 0 && /^[A-Za-z_]\w*=\w+$/.test(x));
      parts.splice(at < 0 ? parts.length : at, 0, ...xs);
    };
    used.add(m);
    const type = (cmd.p?.[m] ?? '').toLowerCase();
    if (m === 'selector') {
      const have = (['id', 'name', 'xpath', 'css'] as const).find((k) => used.has(k));
      const kind = have ?? 'id';
      const label = { id: 'Id', name: 'Name', xpath: 'XPath', css: 'CssSelector' }[kind];
      insert(`--selector "${label}"`, ...(have ? [] : [`--id "{{ROSETTA: id}}"`]));
      used.add(kind);
      if (!have) filled.push('--id (element selector)');
      return;
    }
    const def = requiredDefaults[verb]?.[m];
    const linked = chain.get(cmd.p?.[m] ?? '');
    if (linked) insert(`--${m} \${${linked}}`);
    else if (def !== undefined) insert(`--${m} ${quote(def)}`);
    else if (type === 'boolean') insert(`--${m}`);
    else {
      insert(`--${m} "{{ROSETTA: ${m}}}"`);
      filled.push(`--${m}`);
    }
  };
  for (const m of requiredParams()[verb] ?? []) fill(m);
  let line2 = parts.join(' ');
  let errors = checkWal(line2).filter((p) => p.severity === 'error');
  const missing = errors.map((e) => /requires --([A-Za-z0-9]+)/.exec(e.message)?.[1]);
  if (errors.length && missing.every((m) => m !== undefined)) {
    for (const m of new Set(missing)) fill(m);
    line2 = parts.join(' ');
    errors = checkWal(line2).filter((p) => p.severity === 'error');
  }
  if (filled.length)
    notes.push({
      kind: 'manual',
      text: `${key}: required ${filled.join(', ')} has no A360 source - replace the {{ROSETTA: …}} placeholder`,
    });
  if (errors.length) return errors.map((e) => e.message).join(' | ');
  return { line: line2, notes };
}

/** Script opened by an A360 JavaScript / VBScript / Python "Open" command, per session. */
interface ScriptSession {
  readonly inline: boolean;
  readonly expr: Expr;
}
const scriptSessions = new WeakMap<LowerState, Map<string, ScriptSession>>();
const scriptLangs: Readonly<Record<string, string>> = {
  JavaScript: 'JavaScript',
  VBScript: 'VBScript',
  Python: 'Python',
};

/**
 * A360 script packages (JavaScript, VBScript, Python): Open keeps the script per session,
 * Run function / Run script becomes `runWindowsScript` (JavaScript, VBScript) or a
 * `runDOSCommand` python call, Close writes nothing.
 */
export function lowerScript(a: ActionStmt, w: WalWriter, s: LowerState): boolean {
  const key = sourceKey(a);
  const m = key ? /^(JavaScript|VBScript|Python)\/\w+\.commands\.(\w+)$/.exec(key) : null;
  const pkg = m?.[1];
  const cmd = m?.[2];
  if (!key || !pkg || !cmd) return false;
  const lang = scriptLangs[pkg] ?? pkg;
  const sessions = scriptSessions.get(s) ?? new Map<string, ScriptSession>();
  scriptSessions.set(s, sessions);
  const name = String(literal(a.args.session) ?? 'Default');
  const notes: NoteInput[] = [];
  const sink: NoteSink = (n) => notes.push(n);
  const verify = (text: string): NoteInput => ({
    kind: 'verify',
    assumption: 'A-27',
    text: `${key}: ${text}`,
  });

  if (cmd === 'openScript') {
    const option = String(literal(a.args.scriptOption) ?? '');
    const file = Object.entries(a.args).find(([k]) => /file|path/i.test(k))?.[1];
    const script = a.args.script;
    const inline = option !== 'FILE' && script !== undefined;
    const expr = inline ? script : file;
    if (expr) sessions.set(name, { inline, expr });
    w.comment(
      `A360 ${key}: ${lang} script kept for session "${name}" (${inline ? 'inline' : 'file'})`,
    );
    return true;
  }
  if (cmd === 'closeScript') {
    w.comment(`A360 ${key}: nothing to close in IBM RPA`);
    return true;
  }
  const session = sessions.get(name);
  const result = a.outputs.result?.name;
  const fn = literal(a.args.functionName);
  const args = a.args.argument ?? a.args.arguments;
  if (!session) {
    w.comment(`TODO [ROSETTA] ${key}: script session "${name}" was not opened in this bot`, {
      kind: 'manual',
      text: `${key}: script session "${name}" not opened in this bot`,
    });
    return true;
  }
  if (lang === 'Python') {
    const path = session.inline
      ? '{{ROSETTA: save the inline Python script to a .py file}}'
      : textOf(session.expr, sink);
    const call = fn
      ? ` -c "import runpy,sys; m=runpy.run_path(r'${path}'); print(m['${String(fn)}'](*sys.argv[1:]))"`
      : ` "${path}"`;
    const argText = args ? ` ${textOf(args, sink)}` : '';
    w.line(
      `runDOSCommand --command ${quote(`python${call}${argText}`)}${result ? ` ${result}=value` : ''}`,
      ...notes,
      verify(
        'Python runs through runDOSCommand: python must be on PATH; the function result is read from standard output',
      ),
      ...(session.inline
        ? [
            {
              kind: 'manual' as const,
              text: `${key}: the A360 inline Python script must be saved to a .py file`,
            },
          ]
        : []),
    );
    return true;
  }
  // JavaScript / VBScript: Windows Script Host
  const parts = [`runWindowsScript --scripttype ${quote(lang)}`];
  if (session.inline) {
    const src = textOf(session.expr, sink);
    const call =
      fn === undefined || fn === null
        ? ''
        : lang === 'JavaScript'
          ? `\nvar rosettaArgs=[];for(var i=0;i<WScript.Arguments.length;i++)rosettaArgs.push(WScript.Arguments(i));WScript.StdOut.Write(${String(fn)}.apply(null,rosettaArgs));`
          : `\nWScript.StdOut.Write ${String(fn)}()`;
    parts.push(`--source "Script" --script ${quote(src + call)}`);
  } else {
    parts.push(`--source "File" --file ${quote(textOf(session.expr, sink))}`);
    if (fn !== undefined && fn !== null)
      notes.push({
        kind: 'manual',
        text: `${key}: the file must call ${String(fn)} and write its result with WScript.StdOut.Write`,
      });
  }
  if (args) parts.push(`--arguments ${quote(textOf(args, sink))}`);
  if (result) parts.push(`${result}=output`);
  w.line(
    parts.join(' '),
    ...notes,
    verify(
      'runWindowsScript --scripttype/--source values from the 30.0.x reference; function call appended for WSH',
    ),
  );
  return true;
}

/**
 * Commands that only set context in A360 (STATE: open a script, connect to FTP, switch sheet)
 * or have no runtime effect (DROP, STRUCTURAL): no IBM command. A STATE command's file, path or
 * host value is kept in the session helper that generated commands of the same session use.
 */
export function lowerState(a: ActionStmt, w: WalWriter, s: LowerState): boolean {
  const key = sourceKey(a);
  if (!key) return false;
  const rule = conversionRules()[key];
  if (!rule || !['STATE', 'DROP', 'STRUCTURAL'].includes(rule.s)) return false;
  const note: NoteInput = {
    kind: 'verify',
    assumption: 'A-27',
    text: `${key}: ${rule.s} in the mapping dictionary (${rule.t}); no IBM command written`,
  };
  if (rule.s === 'STATE') {
    const pkg = key.split('/')[0] ?? '';
    // Option selectors (e.g. FILE / MANUAL) are upper-case tokens, not values.
    const isValue = ([, e]: [string, Expr]) =>
      !(e.kind === 'literal' && typeof e.value === 'string' && /^[A-Z_]+$/.test(e.value));
    const valueArg =
      Object.entries(a.args).find((x) => /file|path/i.test(x[0]) && isValue(x)) ??
      Object.entries(a.args).find((x) => /host|server|url|script/i.test(x[0]) && isValue(x));
    if (valueArg) {
      const sink: NoteSink = () => undefined;
      w.line(
        `setVar --name "\${${sessionHandle(pkg, a, s)}}" --value ${quote(textOf(valueArg[1], sink))}`,
        note,
      );
      return true;
    }
  }
  w.comment(
    `A360 ${key}: ${rule.s === 'STATE' ? 'sets context only' : 'no runtime effect'} (${rule.t})`,
    note,
  );
  return true;
}

/**
 * Tier 3: REST/SaaS commands (PATTERN) become an `httpRequest` skeleton with the JSON body
 * built from the A360 attributes; the endpoint URL is a visible placeholder.
 */
export function lowerTemplate(a: ActionStmt, w: WalWriter): boolean {
  const key = sourceKey(a);
  if (!key) return false;
  const rule = conversionRules()[key];
  if (rule?.s !== 'PATTERN') return false;
  const notes: NoteInput[] = [];
  const sink: NoteSink = (n) => notes.push(n);
  const body: string[] = [];
  const query: string[] = [];
  const review: string[] = [];
  for (const [rawPath, expr] of Object.entries(a.args)) {
    const path = normPath(rawPath);
    const how = rule.p?.[path]?.[1] ?? '';
    const name = path.split('.').pop() ?? path;
    if (how === 'BODY_FIELD') body.push(`"${name}":"${textOf(expr, sink)}"`);
    else if (how === 'URL_PARAM') query.push(`${name}=${textOf(expr, sink)}`);
    else if (how === 'VAULT')
      review.push(`${path}: credential → getVaultItem, then --headers Authorization`);
    else if (!['DROP', 'N/A', ''].includes(how)) review.push(`${path} (${how || 'no rule'})`);
  }
  const verb = body.length ? 'Post' : 'Get';
  const url = `{{ROSETTA: ${key} endpoint}}${query.length ? `?${query.join('&')}` : ''}`;
  const result = a.outputs.result?.name;
  const parts = [
    `httpRequest --verb "${verb}" --url ${quote(url)}`,
    ...(body.length ? [`--formatter "Json" --source ${quote(`{${body.join(',')}}`)}`] : []),
    ...(result ? [`${result}=value`] : []),
  ];
  notes.push({
    kind: 'manual',
    assumption: 'A-27',
    text: `${key}: REST template (${rule.t}). Set the vendor endpoint URL, HTTP verb and authentication${review.length ? `; review: ${review.join('; ')}` : ''}`,
  });
  w.line(parts.join(' '), ...notes);
  return true;
}

/** Generated lines the static checker rejected, by command (shown in the stub). */
export const rejected = new Map<string, string>();

/** Subroutine name of the stub for one A360 command. */
export const stubName = (key: string): string =>
  `Rosetta_${key.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

/**
 * Tier 4: body of the stub subroutine for an A360 command with no IBM conversion. The stub
 * fails on purpose (`failTest`), so a run never continues with missing data; the developer
 * replaces its body.
 */
export function stubFor(key: string, sw: WalWriter): void {
  const rule = conversionRules()[key];
  sw.line(`beginSub --name ${stubName(key)}`);
  sw.comment(`A360 ${key}: no IBM RPA conversion yet. Replace this body.`);
  if (rule) sw.comment(`Proposed (${rule.s}): ${rule.t || 'redesign'}`);
  const why = rejected.get(key);
  if (why) sw.comment(`Generated line rejected by the static checker: ${why}`);
  sw.line(
    `failTest --message ${quote(`Not converted: A360 ${key} (Rosetta stub ${stubName(key)})`)}`,
  );
  sw.line('endSub');
}

/** Main-flow lines for a stubbed command: the A360 inputs as comments, then the call. */
export function callStub(a: ActionStmt, key: string, w: WalWriter): void {
  const notes: NoteInput[] = [];
  const sink: NoteSink = (n) => notes.push(n);
  w.comment(`A360 ${key} (not converted; inputs below):`);
  for (const [k, e] of Object.entries(a.args)) w.comment(`  ${k} = ${textOf(e, sink)}`);
  for (const [k, v] of Object.entries(a.outputs)) w.comment(`  output ${k} → ${v.name}`);
  const rule = conversionRules()[key];
  w.line(`goSub --label ${stubName(key)}`, {
    kind: 'manual',
    text: `${key}: stub subroutine ${stubName(key)}${rule ? ` (proposed ${rule.s}: ${rule.t || 'redesign'})` : ' (command not in the mapping dictionary)'}`,
  });
}
