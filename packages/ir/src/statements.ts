import type { Expr, VarRefExpr } from './expr.js';
import type { JsonValue } from './json.js';
import type { Platform, SourceRef } from './source-ref.js';
import type { UITarget } from './ui-target.js';

/** Canonical operation, `<family>.<verb>`, e.g. `excel.open`, `string.replace` (ADR-004). */
export type CanonicalOp = `${string}.${string}`;

/** Source operation kept as-is because no canonical op exists yet, e.g. `vendor:a360/Excel_MS/open`. */
export type VendorOp = `vendor:${Platform}/${string}`;

export type OpName = CanonicalOp | VendorOp;

/** Fields shared by every statement. */
export interface StatementBase {
  /** Unique within the bot; stable across re-runs of the same input. */
  readonly id: string;
  readonly source?: SourceRef;
  /** Disabled in the source. Never emitted silently; always reported. */
  readonly disabled?: boolean;
}

export type Block = readonly Statement[];

export interface ActionStmt extends StatementBase {
  readonly kind: 'action';
  readonly op: OpName;
  readonly args: Readonly<Record<string, Expr>>;
  readonly outputs: Readonly<Record<string, VarRefExpr>>;
  /** The session/handle variable this action works on, if any. */
  readonly resource?: VarRefExpr;
  readonly target?: UITarget;
}

export interface IfBranch {
  readonly condition: Expr;
  readonly body: Block;
}

export interface IfStmt extends StatementBase {
  readonly kind: 'if';
  /** First branch is the `if`, the rest are `else if`. */
  readonly branches: readonly IfBranch[];
  readonly else?: Block;
}

export type CollectionKind = 'list' | 'dict' | 'tableRow' | 'file' | 'folder' | 'other';

export type LoopSpec =
  | { readonly kind: 'times'; readonly count: Expr; readonly indexVar?: VarRefExpr }
  | { readonly kind: 'while'; readonly condition: Expr }
  | {
      readonly kind: 'forEach';
      readonly collection: CollectionKind;
      readonly source: Expr;
      readonly itemVar: VarRefExpr;
      readonly keyVar?: VarRefExpr;
    };

export interface LoopStmt extends StatementBase {
  readonly kind: 'loop';
  readonly loop: LoopSpec;
  readonly body: Block;
}

export interface BreakStmt extends StatementBase {
  readonly kind: 'break';
}

export interface ContinueStmt extends StatementBase {
  readonly kind: 'continue';
}

/** Business vs system classification. Defaults to `system` unless overridden (ADR-012). */
export type ErrorCategory = 'business' | 'system';

export interface CatchClause {
  /** Variable receiving the error message, if the source declares one. */
  readonly errorVar?: VarRefExpr;
  /** Source-specific exception type name, kept verbatim. */
  readonly errorType?: string;
  readonly body: Block;
}

export interface TryStmt extends StatementBase {
  readonly kind: 'try';
  readonly body: Block;
  readonly catches: readonly CatchClause[];
  readonly finally?: Block;
}

export interface ThrowStmt extends StatementBase {
  readonly kind: 'throw';
  readonly message: Expr;
  readonly category: ErrorCategory;
}

/** Reference to another bot, as written in the source and, once resolved, by IR id. */
export interface BotRef {
  readonly path: string;
  readonly resolvedId?: string;
}

export interface CallBotStmt extends StatementBase {
  readonly kind: 'callBot';
  readonly target: BotRef;
  readonly inputs: Readonly<Record<string, Expr>>;
  readonly outputs: Readonly<Record<string, VarRefExpr>>;
}

/** Ends the bot immediately. */
export interface StopStmt extends StatementBase {
  readonly kind: 'stop';
}

/** Named group of statements, e.g. an A360 Step. */
export interface GroupStmt extends StatementBase {
  readonly kind: 'group';
  readonly label: string;
  readonly body: Block;
}

export interface CommentStmt extends StatementBase {
  readonly kind: 'comment';
  readonly text: string;
}

/** Source node we could not understand. Kept verbatim so nothing is ever dropped (ADR-003). */
export interface UnknownStmt extends StatementBase {
  readonly kind: 'unknown';
  readonly raw: JsonValue;
  readonly reason: string;
}

export type Statement =
  | ActionStmt
  | IfStmt
  | LoopStmt
  | BreakStmt
  | ContinueStmt
  | TryStmt
  | ThrowStmt
  | CallBotStmt
  | StopStmt
  | GroupStmt
  | CommentStmt
  | UnknownStmt;

export type StatementKind = Statement['kind'];
