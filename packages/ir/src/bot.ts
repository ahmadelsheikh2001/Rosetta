import type { Diagnostic } from './diagnostics.js';
import type { Expr } from './expr.js';
import type { SourceRef } from './source-ref.js';
import type { Block } from './statements.js';
import type { IRType } from './types.js';

export type VariableDirection = 'local' | 'input' | 'output' | 'inout';

export interface Variable {
  readonly name: string;
  readonly type: IRType;
  readonly direction: VariableDirection;
  readonly defaultValue?: Expr;
  /** Never logged, never written as a literal (credentials, personal data). */
  readonly sensitive: boolean;
  readonly description?: string;
  readonly source?: SourceRef;
}

/** A source package and the version the bot was saved with (ADR-007). */
export interface PackageVersion {
  readonly name: string;
  readonly version: string;
}

export interface Bot {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly source: SourceRef;
  readonly variables: readonly Variable[];
  readonly body: Block;
  readonly packages: readonly PackageVersion[];
}

export type DependencyTarget =
  | { readonly kind: 'bot'; readonly botId: string }
  | { readonly kind: 'file'; readonly path: string };

export interface Dependency {
  readonly from: string;
  readonly to: DependencyTarget;
}

/** Everything produced from one input export. */
export interface Project {
  readonly bots: readonly Bot[];
  readonly dependencies: readonly Dependency[];
  readonly diagnostics: readonly Diagnostic[];
}
