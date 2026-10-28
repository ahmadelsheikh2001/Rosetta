import type { Platform } from './source-ref.js';

/** One step of an access path: `list[0]` or `dict{"key"}`. */
export type AccessStep =
  { readonly kind: 'index'; readonly index: Expr } | { readonly kind: 'key'; readonly key: Expr };

export interface LiteralExpr {
  readonly kind: 'literal';
  readonly value: string | number | boolean | null;
}

/** Reference to a variable, optionally drilling into it. */
export interface VarRefExpr {
  readonly kind: 'var';
  readonly name: string;
  readonly path: readonly AccessStep[];
}

/** String built from literal and dynamic parts, e.g. `"Hello $name$"`. */
export interface TemplateExpr {
  readonly kind: 'template';
  readonly parts: readonly Expr[];
}

/** Call to a canonical function, e.g. `string.upper`. */
export interface CallExpr {
  readonly kind: 'call';
  readonly fn: string;
  readonly args: readonly Expr[];
}

export type BinaryOp =
  'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'and' | 'or' | 'add' | 'sub' | 'mul' | 'div' | 'mod';

export interface BinaryExpr {
  readonly kind: 'binary';
  readonly op: BinaryOp;
  readonly left: Expr;
  readonly right: Expr;
}

export interface UnaryExpr {
  readonly kind: 'unary';
  readonly op: 'not' | 'neg';
  readonly operand: Expr;
}

/** Platform-provided value such as the current date. Canonical names are defined per mapping. */
export interface SystemVarExpr {
  readonly kind: 'system';
  readonly name: string;
}

/** Expression text we could not parse; kept verbatim and always reported (ADR-006). */
export interface RawExpr {
  readonly kind: 'raw';
  readonly text: string;
  readonly dialect: Platform;
  readonly reason: string;
}

/** Vendor-neutral expression tree. */
export type Expr =
  | LiteralExpr
  | VarRefExpr
  | TemplateExpr
  | CallExpr
  | BinaryExpr
  | UnaryExpr
  | SystemVarExpr
  | RawExpr;
