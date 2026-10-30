import { parseA360 } from '@rosetta/expr';
import type { Expr, IRType, SourceRef, VarRefExpr } from '@rosetta/ir';
import { LiftCode, type LiftContext } from './context.js';
import type { SourceValue, SourceVariable } from './schema.js';

const literal = (value: string | number | boolean): Expr => ({ kind: 'literal', value });

/** A string field of a loosely typed payload, or "". */
const text = (x: unknown): string => (typeof x === 'string' ? x : '');

/** Parses an `expression` payload; unreadable text is reported and kept as `raw`. */
function expression(text: string, ctx: LiftContext, at?: SourceRef): Expr {
  const expr = parseA360(text);
  if (expr.kind === 'raw') {
    ctx.report(LiftCode.RawExpression, 'warning', { text, reason: expr.reason }, at);
  }
  return expr;
}

/**
 * Converts a source value to an IR expression (docs/formats/a360-bot-json.md § Values).
 * `expression` always wins over a literal payload because it is the dynamic form.
 */
export function valueToExpr(value: SourceValue, ctx: LiftContext, at?: SourceRef): Expr {
  if (value.expression !== undefined) return expression(value.expression, ctx, at);

  switch (value.type) {
    case 'STRING':
    case 'DATETIME':
    case 'FILE':
      return literal(value.string ?? '');
    case 'NUMBER': {
      const n = Number(value.number);
      if (value.number === undefined || value.number.trim() === '' || Number.isNaN(n)) {
        ctx.report(
          LiftCode.UnknownValue,
          'warning',
          { type: 'NUMBER', value: value.number ?? '' },
          at,
        );
        return literal(value.number ?? '');
      }
      return literal(n);
    }
    case 'BOOLEAN':
      return literal(value.boolean ?? false);
    case 'VARIABLE':
      return varRefOf(value) ?? unknown(value, ctx, at);
    case 'VARIABLEMAP':
      return {
        kind: 'call',
        fn: 'list.of',
        args: (value.variableMapNames ?? []).map((n): Expr => {
          const declared = ctx.variablesByLowerName.get(n.toLowerCase());
          return declared ? { kind: 'var', name: declared, path: [] } : literal(n);
        }),
      };
    case 'LIST':
      return {
        kind: 'call',
        fn: 'list.of',
        args: (value.list ?? []).map((v) => valueToExpr(v, ctx, at)),
      };
    case 'DICTIONARY':
      return {
        kind: 'call',
        fn: 'dict.of',
        args: (value.dictionary ?? []).flatMap((e) => [
          literal(e.key),
          valueToExpr(e.value, ctx, at),
        ]),
      };
    case 'TABLE':
      return { kind: 'call', fn: 'table.of', args: [literal(JSON.stringify(value.table ?? null))] };
    case 'RECORD':
      return {
        kind: 'call',
        fn: 'record.of',
        args: [literal(JSON.stringify(value.record ?? null))],
      };
    case 'WINDOW': {
      // corpus 09: { name, windowType: BROWSER_CHROME, browserTabUrl, … }; the window is reached
      // through the browser the bot opens, so only its title and type are kept.
      const w = (value.window ?? {}) as { name?: unknown; windowType?: unknown };
      return {
        kind: 'call',
        fn: 'window.of',
        args: [literal(text(w.name)), literal(text(w.windowType))],
      };
    }
    case 'SESSION':
      // Sessions are named; actions refer to them by name (corpus 04 stores the name as STRING).
      return value.sessionName ? valueToExpr(value.sessionName, ctx, at) : unknown(value, ctx, at);
    case 'CREDENTIAL':
      // Vault reference (corpus 08): never a value, only where to find it.
      if (value.credential) {
        const c = value.credential;
        return {
          kind: 'call',
          fn: 'credential.vault',
          args: [literal(c.lockerName), literal(c.name), literal(c.attributeName)],
        };
      }
      return value.string !== undefined ? literal(value.string) : unknown(value, ctx, at);
    default:
      return unknown(value, ctx, at);
  }
}

function unknown(value: SourceValue, ctx: LiftContext, at?: SourceRef): Expr {
  ctx.report(LiftCode.UnknownValue, 'warning', { type: value.type }, at);
  return {
    kind: 'raw',
    text: JSON.stringify(value),
    dialect: 'a360',
    reason: `value type ${value.type}`,
  };
}

/** `{ type: VARIABLE, variableName }` → variable reference. */
export function varRefOf(value: SourceValue | undefined): VarRefExpr | undefined {
  if (value?.type !== 'VARIABLE' || value.variableName === undefined) return undefined;
  return { kind: 'var', name: value.variableName, path: [] };
}

const scalarTypes: Readonly<Record<string, IRType>> = {
  STRING: { kind: 'string' },
  NUMBER: { kind: 'number' },
  BOOLEAN: { kind: 'boolean' },
  DATETIME: { kind: 'datetime' },
  TABLE: { kind: 'table' },
  RECORD: { kind: 'record' },
  CREDENTIAL: { kind: 'credential' },
};

/** Maps an A360 variable type (and subtype for lists/dictionaries) to an IR type. */
export function variableType(variable: SourceVariable, ctx: LiftContext): IRType {
  const scalar = scalarTypes[variable.type];
  if (scalar) return scalar;
  if (variable.type === 'WINDOW') {
    const w = variable.defaultValue?.window as { windowType?: unknown } | undefined;
    const browser = text(w?.windowType).startsWith('BROWSER_');
    return { kind: 'handle', resource: browser ? 'browser' : 'window' };
  }
  if (variable.type === 'LIST' || variable.type === 'DICTIONARY') {
    const of = variable.subtype ? scalarTypes[variable.subtype] : undefined;
    return { kind: variable.type === 'LIST' ? 'list' : 'dict', of: of ?? { kind: 'any' } };
  }
  ctx.report(LiftCode.VariableType, 'warning', { variable: variable.name, type: variable.type });
  return { kind: 'unknown', sourceType: variable.type };
}
