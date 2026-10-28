/** Process exit codes of the `rosetta` command. Stable: scripts and CI may depend on them. */
export const ExitCode = {
  Ok: 0,
  /** Unexpected internal error (a bug). */
  Internal: 1,
  /** Wrong command line: unknown command or option, missing argument. */
  Usage: 2,
  /** A standards profile or project overrides file is invalid. */
  Config: 3,
  /** The input folder or file cannot be used. */
  Input: 4,
  /** The requested step exists but is not implemented yet. */
  NotImplemented: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
