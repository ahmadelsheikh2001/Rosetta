/** Kinds of long-lived resources a bot opens and passes between actions (ADR-003). */
export type ResourceKind =
  'excel' | 'browser' | 'window' | 'file' | 'database' | 'email' | 'terminal' | 'other';

/** Vendor-neutral variable type. */
export type IRType =
  | { readonly kind: 'string' }
  | { readonly kind: 'number' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'datetime' }
  | { readonly kind: 'list'; readonly of: IRType }
  | { readonly kind: 'dict'; readonly of: IRType }
  | { readonly kind: 'table' }
  | { readonly kind: 'record' }
  | { readonly kind: 'credential' }
  | { readonly kind: 'handle'; readonly resource: ResourceKind }
  | { readonly kind: 'any' }
  /** A source type we could not map; `sourceType` keeps the original name. */
  | { readonly kind: 'unknown'; readonly sourceType: string };

/** Discriminator values of {@link IRType}. */
export type IRTypeKind = IRType['kind'];
