import { COMMENT, EOL } from './syntax.js';

/**
 * - `verify`: draft WAL syntax, check it in Studio (tied to a W-xx assumption).
 * - `semantic`: converted, but behaviour may differ from the source; review.
 * - `manual`: not converted; a TODO comment marks the place.
 */
export type NoteKind = 'verify' | 'semantic' | 'manual';

export interface WalNote {
  /** 1-based line in the generated file. */
  readonly line: number;
  readonly kind: NoteKind;
  /** Assumption id (`W-05`, `A-19`) the line depends on, if any. */
  readonly assumption?: string;
  readonly text: string;
  /** Source location label, e.g. `String/trim @ 1.3`. */
  readonly source?: string;
}

export type NoteInput = Omit<WalNote, 'line' | 'source'>;

/** Accumulates WAL lines and the notes attached to them. */
export class WalWriter {
  readonly lines: string[] = [];
  readonly notes: WalNote[] = [];
  private commentDepth = 0;
  private commentPrefix = COMMENT;
  /** Source label applied to notes written while it is set. */
  source: string | undefined;

  /** Writes a line; inside {@link commented} it is turned into a comment. */
  line(text: string, ...notes: NoteInput[]): void {
    this.lines.push(this.commentDepth > 0 ? `${this.commentPrefix}${text}` : text);
    this.note(...notes);
  }

  /** Attaches notes to the last written line. */
  note(...notes: NoteInput[]): void {
    const line = Math.max(1, this.lines.length);
    for (const n of notes) {
      this.notes.push({ ...n, line, ...(this.source ? { source: this.source } : {}) });
    }
  }

  comment(text: string, ...notes: NoteInput[]): void {
    for (const part of text.split(/\r?\n/)) this.line(`${COMMENT}${part}`.trimEnd());
    this.note(...notes);
  }

  /** Writes everything produced by `body` as comments (disabled or unconvertible code). */
  commented(prefix: string, body: () => void): void {
    const saved = this.commentPrefix;
    if (this.commentDepth === 0) this.commentPrefix = `${COMMENT}${prefix}`;
    this.commentDepth++;
    try {
      body();
    } finally {
      this.commentDepth--;
      this.commentPrefix = saved;
    }
  }

  get inComment(): boolean {
    return this.commentDepth > 0;
  }

  /** Appends another writer's lines; its note line numbers are shifted accordingly. */
  append(other: WalWriter): void {
    const offset = this.lines.length;
    this.lines.push(...other.lines);
    for (const n of other.notes) this.notes.push({ ...n, line: n.line + offset });
  }

  toString(): string {
    return this.lines.join(EOL) + EOL;
  }
}
