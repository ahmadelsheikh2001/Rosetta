/** Where the CLI writes; injected so commands are testable without a real process. */
export interface Io {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  readonly cwd: string;
}
