/** RPA platforms RPA Rosetta can read from or write to. */
export type Platform = 'a360' | 'ibm-rpa';

/**
 * Points back to the exact place in a source bot that an IR node came from.
 * Every report finding is anchored to one of these (ADR-003).
 */
export interface SourceRef {
  readonly platform: Platform;
  /** Path of the bot file inside the export, using forward slashes. */
  readonly file: string;
  /** Child-index path from the bot root to the node, e.g. `[2, 0, 5]`. */
  readonly nodePath: readonly number[];
  /** Stable identifier from the source format, when it has one. */
  readonly nodeId?: string;
  /** Human-readable label: Step title or `package/command`. */
  readonly label?: string;
}
