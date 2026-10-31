import type { ActionStmt, Expr, Statement, Variable, VarRefExpr } from '@rosetta/ir';

/**
 * Undoes how target-wal writes an A360 loop over the rows of an Excel session (corpus 05):
 *
 *   excelGetTable --file ${excel} … T=value R=rows
 *   for --variable ${i} --from 1 --to ${R}
 *     mapTableRow --dataTable ${T} --row ${i} --mappings "name=Col=${rec_Col},…"
 *     …
 *   next
 *
 * becomes a loop over the session's rows into the record variable, whose columns are read as
 * `$rec{Col}$` again. The `rec_Col` variables were written for the record by target-wal, after a
 * `// rec (A360 Record): …` comment. A "Save workbook" comment before `excelClose` becomes a save.
 */
const RECORD_COMMENT = /^(\w+) \(A360 Record\): one String variable per column the bot reads$/;
const SAVE_COMMENT = 'A360 Save workbook: ';

const verbOf = (s: Statement | undefined): string | undefined =>
  s?.kind === 'action' && s.op.startsWith('vendor:ibm-rpa/')
    ? s.op.slice('vendor:ibm-rpa/'.length)
    : undefined;

const varName = (e: Expr | undefined): string | undefined =>
  e?.kind === 'var' && e.path.length === 0 ? e.name : undefined;

/** A360 session of an Excel instance variable: target-wal names it `rosettaExcel<Session>`. */
export const excelSession = (variable: string): string =>
  /^rosettaExcel(\w+)$/.exec(variable)?.[1] ?? variable;

/** `name=<column>=${var}` pairs of a mapTableRow `--mappings` value (read as a template). */
function columns(e: Expr | undefined): [string, string][] {
  const parts = e?.kind === 'template' ? e.parts : e ? [e] : [];
  const out: [string, string][] = [];
  parts.forEach((p, i) => {
    const before = parts[i - 1];
    const label =
      before?.kind === 'literal' ? /(?:^|,)name=(.*)=$/.exec(String(before.value)) : null;
    if (p.kind === 'var' && p.path.length === 0 && label) out.push([label[1] ?? '', p.name]);
  });
  return out;
}

export function rebuildTables(
  body: readonly Statement[],
  variables: readonly Variable[],
): { body: Statement[]; variables: Variable[] } {
  const records = new Set<string>();
  /** `rec_Col` → `$rec{Col}$` */
  const fields = new Map<string, Expr>();
  /** Excel variables whose table was read with headers. */
  const headers = new Set<string>();

  const block = (stmts: readonly Statement[]): Statement[] => {
    const out: Statement[] = [];
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (!s) continue;
      const record = s.kind === 'comment' ? RECORD_COMMENT.exec(s.text) : null;
      if (record) {
        records.add(record[1] ?? '');
        continue;
      }
      const next = stmts[i + 1];
      if (
        s.kind === 'comment' &&
        s.text.startsWith(SAVE_COMMENT) &&
        verbOf(next) === 'excelClose'
      ) {
        const file = (next as ActionStmt).args.file;
        out.push({
          id: s.id,
          ...(s.source ? { source: s.source } : {}),
          kind: 'action',
          op: 'vendor:ibm-rpa/excelSave',
          args: file ? { file } : {},
          outputs: {},
        });
        continue;
      }
      const loop = s.kind === 'loop' ? tableLoop(s, out) : undefined;
      if (loop) {
        out.push(loop);
        continue;
      }
      out.push(children(s));
    }
    return out;
  };

  const children = (s: Statement): Statement => {
    if (s.kind === 'if')
      return {
        ...s,
        branches: s.branches.map((b) => ({ ...b, body: block(b.body) })),
        ...(s.else ? { else: block(s.else) } : {}),
      };
    if (s.kind === 'try')
      return {
        ...s,
        body: block(s.body),
        catches: s.catches.map((c) => ({ ...c, body: block(c.body) })),
        ...(s.finally ? { finally: block(s.finally) } : {}),
      };
    if ('body' in s && Array.isArray(s.body)) return { ...s, body: block(s.body as Statement[]) };
    return s;
  };

  /** The loop over table rows, if `s` is one; removes its excelGetTable from `before`. */
  const tableLoop = (
    s: Extract<Statement, { kind: 'loop' }>,
    before: Statement[],
  ): Statement | undefined => {
    if (s.loop.kind !== 'times' || !s.loop.indexVar) return undefined;
    const [map, ...rest] = s.body;
    if (verbOf(map) !== 'mapTableRow' || map?.kind !== 'action') return undefined;
    const table = varName(map.args.dataTable);
    if (!table || varName(map.args.row) !== s.loop.indexVar.name) return undefined;
    const at = before.findIndex(
      (b) => verbOf(b) === 'excelGetTable' && (b as ActionStmt).outputs.value?.name === table,
    );
    const get = before[at] as ActionStmt | undefined;
    const excel = varName(get?.args.file);
    if (!get || !excel || varName(s.loop.count) !== get.outputs.rows?.name) return undefined;
    const cols = columns(map.args.mappings);
    const rec = [...records].find((r) => cols.every(([, v]) => v.startsWith(`${r}_`)));
    if (!rec) return undefined;
    before.splice(at, 1);
    if (get.args.hasheaders) headers.add(excel);
    for (const [column, v] of cols)
      fields.set(v, {
        kind: 'var',
        name: rec,
        path: [{ kind: 'key', key: { kind: 'literal', value: column } }],
      });
    const itemVar: VarRefExpr = { kind: 'var', name: rec, path: [] };
    return {
      ...s,
      loop: {
        kind: 'forEach',
        collection: 'tableRow',
        source: {
          kind: 'call',
          fn: 'excel.rows',
          args: [{ kind: 'literal', value: excelSession(excel) }],
        },
        itemVar,
      },
      body: block(rest),
    };
  };

  const replace = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(replace);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (o.kind === 'var' && typeof o.name === 'string' && Array.isArray(o.path) && !o.path.length)
        return fields.get(o.name) ?? o;
      // the workbook was opened for a table read with headers
      if (o.kind === 'action' && o.op === 'vendor:ibm-rpa/excelOpen') {
        const out = (o.outputs as Record<string, VarRefExpr | undefined>).value?.name;
        if (out && headers.has(out))
          return {
            ...o,
            args: { ...(o.args as object), hasheaders: { kind: 'literal', value: true } },
          };
      }
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, replace(v)]));
    }
    return x;
  };

  const rebuilt = block(body);
  const declared = new Set(variables.map((v) => v.name));
  return {
    body: replace(rebuilt) as Statement[],
    variables: [
      ...variables.filter((v) => !fields.has(v.name)),
      ...[...records]
        .filter((r) => !declared.has(r))
        .map((name): Variable => ({
          name,
          type: { kind: 'record' },
          direction: 'local',
          sensitive: false,
        })),
    ],
  };
}
