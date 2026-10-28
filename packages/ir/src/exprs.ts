import type { Expr, VarRefExpr } from './expr.js';
import type { Statement } from './statements.js';

/** Visits `expr` and every sub-expression, depth-first. */
export function walkExpr(expr: Expr, visitor: (e: Expr) => void): void {
  visitor(expr);
  switch (expr.kind) {
    case 'var':
      for (const step of expr.path)
        walkExpr(step.kind === 'index' ? step.index : step.key, visitor);
      return;
    case 'template':
      for (const part of expr.parts) walkExpr(part, visitor);
      return;
    case 'call':
      for (const arg of expr.args) walkExpr(arg, visitor);
      return;
    case 'binary':
      walkExpr(expr.left, visitor);
      walkExpr(expr.right, visitor);
      return;
    case 'unary':
      walkExpr(expr.operand, visitor);
      return;
    case 'literal':
    case 'system':
    case 'raw':
      return;
  }
}

/**
 * Returns the expressions a statement holds directly (arguments, conditions,
 * bindings), not those of nested blocks.
 */
export function statementExprs(stmt: Statement): readonly Expr[] {
  switch (stmt.kind) {
    case 'action':
      return [
        ...Object.values(stmt.args),
        ...Object.values(stmt.outputs),
        ...(stmt.resource ? [stmt.resource] : []),
      ];
    case 'if':
      return stmt.branches.map((b) => b.condition);
    case 'loop': {
      const spec = stmt.loop;
      switch (spec.kind) {
        case 'times':
          return [spec.count, ...(spec.indexVar ? [spec.indexVar] : [])];
        case 'while':
          return [spec.condition];
        case 'forEach':
          return [spec.source, spec.itemVar, ...(spec.keyVar ? [spec.keyVar] : [])];
      }
      break;
    }
    case 'try':
      return stmt.catches.flatMap((c) => (c.errorVar ? [c.errorVar] : []));
    case 'throw':
      return [stmt.message];
    case 'callBot':
      return [...Object.values(stmt.inputs), ...Object.values(stmt.outputs)];
    case 'break':
    case 'continue':
    case 'stop':
    case 'group':
    case 'comment':
    case 'unknown':
      return [];
  }
}

/** Collects the names of all variables referenced in `exprs`. */
export function referencedVariables(exprs: Iterable<Expr>): Set<string> {
  const names = new Set<string>();
  for (const expr of exprs) {
    walkExpr(expr, (e) => {
      if (e.kind === 'var') names.add(e.name);
    });
  }
  return names;
}

/** Shorthand to build a variable reference without an access path. */
export function varRef(name: string): VarRefExpr {
  return { kind: 'var', name, path: [] };
}
