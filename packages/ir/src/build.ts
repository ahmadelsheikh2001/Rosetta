import type { Bot, Variable } from './bot.js';
import type { Expr } from './expr.js';
import type { SourceRef } from './source-ref.js';
import type {
  ActionStmt,
  Block,
  CatchClause,
  GroupStmt,
  IfStmt,
  LoopStmt,
  OpName,
  Statement,
  TryStmt,
} from './statements.js';
import type { IRType } from './types.js';

/**
 * Small factories for building IR by hand: test fixtures and synthetic data.
 * Lifters build IR from real sources; these only fill in the boring fields.
 */
let counter = 0;
const nextId = (): string => `n${++counter}`;

/** Restarts generated ids at `n1`, so a fixture built twice is identical. */
export function resetIds(): void {
  counter = 0;
}

export const lit = (value: string | number | boolean | null): Expr => ({ kind: 'literal', value });

export const ref = (name: string): Extract<Expr, { kind: 'var' }> => ({
  kind: 'var',
  name,
  path: [],
});

export function action(
  op: OpName,
  fields: Partial<Omit<ActionStmt, 'kind' | 'op'>> = {},
): ActionStmt {
  return { id: nextId(), args: {}, outputs: {}, ...fields, kind: 'action', op };
}

export function comment(text: string, fields: Partial<Statement> = {}): Statement {
  return { id: nextId(), ...fields, kind: 'comment', text };
}

export function group(label: string, body: Block, fields: Partial<GroupStmt> = {}): GroupStmt {
  return { id: nextId(), ...fields, kind: 'group', label, body };
}

export function ifThen(condition: Expr, body: Block, elseBody?: Block): IfStmt {
  return {
    id: nextId(),
    kind: 'if',
    branches: [{ condition, body }],
    ...(elseBody ? { else: elseBody } : {}),
  };
}

export function loopTimes(count: number, body: Block): LoopStmt {
  return { id: nextId(), kind: 'loop', loop: { kind: 'times', count: lit(count) }, body };
}

export function tryCatch(body: Block, catches: CatchClause[], finallyBody?: Block): TryStmt {
  return {
    id: nextId(),
    kind: 'try',
    body,
    catches,
    ...(finallyBody ? { finally: finallyBody } : {}),
  };
}

export function variable(
  name: string,
  type: IRType = { kind: 'string' },
  fields: Partial<Omit<Variable, 'name' | 'type'>> = {},
): Variable {
  return { direction: 'local', sensitive: false, ...fields, name, type };
}

export function bot(
  name: string,
  body: Block,
  fields: Partial<Omit<Bot, 'name' | 'body'>> = {},
): Bot {
  const source: SourceRef = { platform: 'a360', file: `bots/${name}`, nodePath: [] };
  return { id: name, source, variables: [], packages: [], ...fields, name, body };
}
