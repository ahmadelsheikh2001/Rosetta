import type { Block, Statement } from './statements.js';

/** Context passed to a visitor for each statement. */
export interface VisitContext {
  /** Nesting depth; top-level statements of a bot body are depth 0. */
  readonly depth: number;
  /** Enclosing statements, outermost first. */
  readonly ancestors: readonly Statement[];
}

/**
 * Returns the nested blocks of a statement in source order.
 * Leaf statements return an empty array.
 */
export function childBlocks(stmt: Statement): readonly Block[] {
  switch (stmt.kind) {
    case 'if':
      return [...stmt.branches.map((b) => b.body), ...(stmt.else ? [stmt.else] : [])];
    case 'loop':
    case 'group':
      return [stmt.body];
    case 'try':
      return [
        stmt.body,
        ...stmt.catches.map((c) => c.body),
        ...(stmt.finally ? [stmt.finally] : []),
      ];
    case 'unknown':
      return stmt.body ? [stmt.body] : [];
    case 'action':
    case 'break':
    case 'continue':
    case 'throw':
    case 'callBot':
    case 'stop':
    case 'comment':
      return [];
  }
}

/** Visits every statement in `block`, depth-first, in source order. */
export function walk(
  block: Block,
  visitor: (stmt: Statement, ctx: VisitContext) => void,
  ctx: VisitContext = { depth: 0, ancestors: [] },
): void {
  for (const stmt of block) {
    visitor(stmt, ctx);
    const inner: VisitContext = { depth: ctx.depth + 1, ancestors: [...ctx.ancestors, stmt] };
    for (const child of childBlocks(stmt)) {
      walk(child, visitor, inner);
    }
  }
}
