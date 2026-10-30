import { walCommands } from './catalog.js';

/** A problem found in a WAL script before it reaches Studio. */
export interface WalProblem {
  /** 1-based line in the script. */
  readonly line: number;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface ParsedLine {
  readonly verb: string;
  /** Input parameters; a flag without a value maps to `true`. */
  readonly params: ReadonlyMap<string, string | true>;
  /** Output assignments, `target=output`. */
  readonly outputs: readonly string[];
}

/**
 * Splits one WAL command line into its verb, `--name value` parameters and `var=output`
 * assignments. Quoted values honour backslash escapes (verified, round 1).
 */
export function parseLine(line: string): ParsedLine | undefined {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === ' ') {
      i++;
      continue;
    }
    let token = '';
    if (line[i] === '"') {
      token += '"';
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) token += line.charAt(i++);
        token += line.charAt(i++);
      }
      if (i >= line.length) return undefined; // unterminated string
      token += '"';
      i++;
    } else {
      while (i < line.length && line[i] !== ' ') token += line.charAt(i++);
    }
    tokens.push(token);
  }
  const [verb, ...rest] = tokens;
  if (!verb) return undefined;
  const params = new Map<string, string | true>();
  const outputs: string[] = [];
  for (let t = 0; t < rest.length; t++) {
    const token = rest[t] ?? '';
    if (token.startsWith('--')) {
      const next = rest[t + 1];
      if (next !== undefined && !next.startsWith('--') && !/^[A-Za-z_]\w*=\w+$/.test(next)) {
        params.set(token.slice(2), next);
        t++;
      } else {
        params.set(token.slice(2), true);
      }
    } else if (/^[A-Za-z_]\w*=\w+$/.test(token)) {
      outputs.push(token);
    } else {
      params.set(`?${t}`, token); // stray value, reported below
    }
  }
  return { verb, params, outputs };
}

const blocks: Readonly<Record<string, string>> = {
  if: 'endIf',
  while: 'endWhile',
  for: 'next',
  foreach: 'endFor',
  do: 'loopWhile',
  beginSub: 'endSub',
};
const closers = new Set(Object.values(blocks));
const unquote = (v: string | true): string =>
  v === true ? '' : v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;

/**
 * Static checks of a generated WAL script against the command catalog and the structure rules
 * Studio 30.0.2 enforced in rounds 1–6. Returns an empty list when nothing is wrong.
 */
export function checkWal(text: string): WalProblem[] {
  const problems: WalProblem[] = [];
  const add = (line: number, severity: WalProblem['severity'], message: string) =>
    problems.push({ line, severity, message });

  const stack: { opener: string; line: number }[] = [];
  const subs = new Set<string>();
  const calls: { label: string; line: number }[] = [];
  let seenCommand = false;
  let seenSub = false;
  let insideSub = false;
  /** Line of the first webStart, and whether any webClose follows. */
  let startedBrowser: number | undefined;
  // widened: it is set inside the line callback, which narrowing does not follow
  let closedBrowser = false as boolean;
  /** Declared variable types, from defVar. */
  const types = new Map<string, string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const n = index + 1;
    const line = raw.trim();
    if (line === '' || line.startsWith('//')) return;

    const parsed = parseLine(line);
    if (!parsed) {
      add(n, 'error', 'Unterminated quoted value.');
      return;
    }
    const { verb, params } = parsed;
    if (verb === 'webStart') startedBrowser ??= n;
    if (verb === 'webClose') closedBrowser = true;

    // structure (rounds 2 and 3)
    if (verb === 'defVar') {
      if (seenCommand)
        add(n, 'error', 'Variable definitions must be at the top of the script (round 2).');
    } else {
      seenCommand = true;
    }
    if (seenSub && !insideSub && verb !== 'beginSub') {
      add(n, 'error', 'Only subroutine blocks may follow the first beginSub (round 3).');
    }
    if (/\$\{[A-Za-z_]\w*\[/.test(line)) {
      add(
        n,
        'error',
        'List or dictionary access inside a value is not interpolated (round 4); use get / strDictGet.',
      );
    }

    // blocks
    if (verb === 'beginSub') {
      if (insideSub) add(n, 'error', 'beginSub inside another subroutine.');
      seenSub = true;
      insideSub = true;
      const name = unquote(params.get('name') ?? '');
      if (subs.has(name)) add(n, 'error', `Subroutine "${name}" is defined twice.`);
      subs.add(name);
    }
    if (verb in blocks) stack.push({ opener: verb, line: n });
    if (closers.has(verb)) {
      const open = stack.pop();
      if (!open || blocks[open.opener] !== verb) {
        add(n, 'error', `${verb} does not close an open ${open ? open.opener : 'block'}.`);
      }
      if (verb === 'endSub') insideSub = false;
    }
    if ((verb === 'elseIf' || verb === 'else') && stack.at(-1)?.opener !== 'if') {
      add(n, 'error', `${verb} outside an if block.`);
    }
    if (verb === 'goSub') calls.push({ label: unquote(params.get('label') ?? ''), line: n });
    if (verb === 'onError' && params.has('label')) {
      calls.push({ label: unquote(params.get('label') ?? ''), line: n });
    }

    // types (round 1: a quoted value for a Numeric/Boolean variable is "Not a number")
    if (verb === 'defVar')
      types.set(unquote(params.get('name') ?? ''), unquote(params.get('type') ?? ''));
    if (verb === 'setVar') {
      const target = /^\$\{(\w+)\}$/.exec(unquote(params.get('name') ?? ''))?.[1];
      const value = params.get('value');
      const type = target ? types.get(target) : undefined;
      const source = /^"?\$\{(\w+)\}"?$/.exec(typeof value === 'string' ? value : '')?.[1];
      for (const v of [target, source]) {
        if (v && types.get(v) === 'SecureString')
          add(n, 'error', `setVar does not accept the SecureString variable ${v} (round 8).`);
      }
      if (
        (type === 'Numeric' || type === 'Boolean') &&
        typeof value === 'string' &&
        value.startsWith('"')
      ) {
        add(
          n,
          'error',
          `${type} variable ${target ?? ''} gets a quoted value: Studio reports "Not a number" (round 1).`,
        );
      }
    }

    // command catalog
    const spec = walCommands[verb];
    if (!spec) {
      add(
        n,
        'error',
        `Unknown command "${verb}" (not in the catalog of verified/documented commands).`,
      );
      return;
    }
    for (const name of params.keys()) {
      if (name.startsWith('?'))
        add(n, 'error', `Value "${String(params.get(name))}" has no parameter name.`);
      else if (!spec.params.includes(name))
        add(n, 'warning', `Parameter --${name} is not known for ${verb}.`);
    }
    for (const req of spec.required ?? []) {
      if (!req.split('|').some((r) => params.has(r))) {
        add(n, 'error', `${verb} requires --${req.split('|').join(' or --')}.`);
      }
    }
    for (const [name, allowed] of Object.entries(spec.enums ?? {})) {
      const value = params.get(name);
      if (
        value !== undefined &&
        !allowed.includes(unquote(value)) &&
        !unquote(value).startsWith('${')
      ) {
        add(
          n,
          'error',
          `${verb} --${name} "${unquote(value)}" is not one of: ${allowed.join(', ')}.`,
        );
      }
    }
  });

  // Studio 30.0.2 warns when a webStart is never closed with webClose (round 10).
  if (startedBrowser !== undefined && !closedBrowser)
    add(startedBrowser, 'warning', "Command 'webStart' must be closed with 'webClose' (round 10).");
  for (const open of stack)
    add(open.line, 'error', `${open.opener} is never closed (${blocks[open.opener] ?? ''}).`);
  for (const c of calls) {
    if (!subs.has(c.label)) add(c.line, 'error', `Subroutine "${c.label}" is not defined.`);
  }
  return problems.sort((a, b) => a.line - b.line);
}
