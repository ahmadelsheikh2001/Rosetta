import { expressionPackage, packageVersions } from './generate.js';

/** A problem found in a generated A360 bot before upload. */
export interface A360Problem {
  /** Where: `nodes[2].children[0]`, `variables`, `packages`. */
  readonly at: string;
  readonly message: string;
}

/**
 * `$System:…$` values seen working in corpus 01–09. A360 checks them only when it compiles the bot
 * for a run (browser-agent import test, 2026-10-31: `deployment.compilation.failed`).
 */
const systemValues = new Set(['Date', 'AATaskName', 'Machine', 'AAControlRoom']);

/** Iterator → the variable type its source must have (editor: "Variable not allowed"). */
const iteratorSources: Readonly<Record<string, { attribute: string; type: string }>> = {
  'list.iterators.list': { attribute: 'list', type: 'LIST' },
  'dictionary.iterators.keys': { attribute: 'sourceMap', type: 'DICTIONARY' },
};

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Checks a generated task bot for what the A360 editor and compiler rejected in the import test:
 * undeclared variables, iterators over the wrong variable type, package versions this Control Room
 * does not have, unknown or package-less `$System:…$` values. The upload API checks none of these.
 */
export function checkA360(bot: Json): A360Problem[] {
  const problems: A360Problem[] = [];
  const add = (at: string, message: string) => problems.push({ at, message });

  const variables = new Map<string, string>();
  for (const v of (bot.variables as Json[] | undefined) ?? [])
    variables.set(String(v.name).toLowerCase(), String(v.type));
  const packages = new Map<string, string>();
  for (const p of (bot.packages as Json[] | undefined) ?? []) {
    const name = String(p.name);
    packages.set(name, String(p.version));
    if (packageVersions[name] !== p.version)
      add(
        'packages',
        `Package ${name} ${String(p.version)} is not one this Control Room is known to have ("Package not found").`,
      );
  }

  const declared = (name: string, at: string) => {
    if (!variables.has(name.toLowerCase()))
      add(at, `Variable "${name}" is not declared ("Variable not found").`);
  };

  /** Excel sessions opened with "Sheet contains a header" (Excel_MS OpenSpreadsheet). */
  const headerSessions = new Set<string>();
  const sessionOf = (v: unknown): string | undefined => {
    const name = isObject(v) && isObject(v.sessionName) ? v.sessionName.string : undefined;
    return typeof name === 'string' ? name : undefined;
  };
  const attrValue = (node: Json, name: string): unknown =>
    ((node.attributes as Json[] | undefined) ?? []).find((a) => a.name === name)?.value;

  const visit = (x: unknown, at: string): void => {
    if (Array.isArray(x)) {
      x.forEach((y, i) => {
        visit(y, `${at}[${String(i)}]`);
      });
      return;
    }
    if (!isObject(x)) {
      if (typeof x === 'string') {
        for (const m of x.matchAll(/\$System:(\w+)/g)) {
          const name = m[1] ?? '';
          if (!systemValues.has(name))
            add(at, `$System:${name}$ is not a known A360 system value.`);
          if (!packages.has('System'))
            add(at, `$System:${name}$ needs the System package in the bot's packages.`);
        }
        for (const m of x.matchAll(expressionPackage)) {
          const pkg = m[1] ?? '';
          if (!packages.has(pkg))
            add(at, `${m[0]} needs the ${pkg} package in the bot's packages.`);
        }
        // $name$, $name[…]$, $name{…}$, $name.Type:…$ (corpus 01–03)
        for (const m of x.matchAll(/\$(?!System:)([A-Za-z_]\w*)(?=[$[{.])/g))
          declared(m[1] ?? '', at);
      }
      return;
    }
    if (
      typeof x.packageName === 'string' &&
      typeof x.commandName === 'string' &&
      !packages.has(x.packageName)
    )
      add(at, `${x.packageName}/${x.commandName} uses a package missing from the bot's packages.`);
    if (x.packageName === 'Excel_MS' && x.commandName === 'OpenSpreadsheet') {
      const header = attrValue(x, 'containsHeader');
      const session = sessionOf(x.returnTo);
      if (session && isObject(header) && header.boolean === true) headerSessions.add(session);
    }
    if (x.packageName === 'Excel_MS' && x.commandName === 'SetCell') {
      // RR_IBM_05 run: "Unable to set the value in the specified cell because it is in the header
      // row and Contains header is enabled" (ba.bot.execution.error)
      const cell = attrValue(x, 'cell');
      const session = sessionOf(attrValue(x, 'session'));
      const text = isObject(cell) && typeof cell.string === 'string' ? cell.string : '';
      if (session && headerSessions.has(session) && /^[A-Za-z]+1$/.test(text))
        add(
          at,
          `Set cell ${text} is in the header row of session "${session}", opened with "Sheet contains a header": A360 stops the bot.`,
        );
    }
    if (x.type === 'VARIABLE' && typeof x.variableName === 'string') declared(x.variableName, at);
    if (x.type === 'VARIABLEMAP' && Array.isArray(x.variableMapNames))
      for (const n of x.variableMapNames) declared(String(n), at);
    if (x.name === 'iterator' && isObject(x.value)) {
      const rule = iteratorSources[String(x.value.iteratorName)];
      const source = ((x.attributes as Json[] | undefined) ?? []).find(
        (a) => a.name === rule?.attribute,
      );
      const value = source && isObject(source.value) ? source.value : undefined;
      const type =
        typeof value?.variableName === 'string'
          ? variables.get(value.variableName.toLowerCase())
          : undefined;
      if (rule && type && type !== rule.type)
        add(
          at,
          `${String(x.value.iteratorName)} needs a ${rule.type} variable, got ${type} ("Variable not allowed").`,
        );
    }
    for (const [k, v] of Object.entries(x)) {
      if (k === 'variables' || k === 'packages') continue;
      visit(v, `${at}.${k}`);
    }
  };
  visit(bot.nodes, 'nodes');
  return problems;
}
