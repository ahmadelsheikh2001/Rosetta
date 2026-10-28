import { describe, expect, it } from 'vitest';
import type { Expr } from './expr.js';
import { referencedVariables, statementExprs, varRef, walkExpr } from './exprs.js';
import type { Statement } from './statements.js';

const lit = (value: string): Expr => ({ kind: 'literal', value });

describe('walkExpr', () => {
  it('visits nested sub-expressions, including access paths', () => {
    const expr: Expr = {
      kind: 'binary',
      op: 'eq',
      left: { kind: 'var', name: 'list', path: [{ kind: 'index', index: varRef('i') }] },
      right: {
        kind: 'template',
        parts: [lit('a'), { kind: 'call', fn: 'f', args: [varRef('x')] }],
      },
    };
    const kinds: string[] = [];
    walkExpr(expr, (e) => kinds.push(e.kind));
    expect(kinds).toEqual(['binary', 'var', 'var', 'template', 'literal', 'call', 'var']);
  });
});

describe('statementExprs', () => {
  it('returns action arguments, outputs and resource', () => {
    const stmt: Statement = {
      id: 'a',
      kind: 'action',
      op: 'excel.open',
      args: { path: lit('x') },
      outputs: { result: varRef('out') },
      resource: varRef('session'),
    };
    expect(referencedVariables(statementExprs(stmt))).toEqual(new Set(['out', 'session']));
  });

  it('returns loop and catch bindings', () => {
    const loop: Statement = {
      id: 'l',
      kind: 'loop',
      loop: { kind: 'forEach', collection: 'list', source: varRef('items'), itemVar: varRef('it') },
      body: [],
    };
    const tryStmt: Statement = {
      id: 't',
      kind: 'try',
      body: [],
      catches: [{ errorVar: varRef('err'), body: [] }],
    };
    expect(referencedVariables(statementExprs(loop))).toEqual(new Set(['items', 'it']));
    expect(referencedVariables(statementExprs(tryStmt))).toEqual(new Set(['err']));
  });

  it('returns nothing for statements without expressions', () => {
    expect(statementExprs({ id: 'c', kind: 'comment', text: 'x' })).toEqual([]);
  });
});
