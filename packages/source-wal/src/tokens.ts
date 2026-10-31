/**
 * One WAL command line split into its parts (IBM RPA 30.0.x script syntax, verified in Studio
 * 30.0.2: `verb --param value --flag target=output`, quoted values with backslash escapes).
 */
export interface WalCommand {
  readonly verb: string;
  /**
   * Parameters in written order. A value keeps its quotes so callers can tell `"5"` from `5`;
   * a flag without a value maps to `true`.
   */
  readonly params: ReadonlyMap<string, string | true>;
  /** `target=output` assignments: the script variable and the command output it receives. */
  readonly outputs: readonly { readonly variable: string; readonly output: string }[];
}

const OUTPUT = /^([A-Za-z_]\w*)=(\w+)$/;

/** Splits a line into tokens; quoted tokens keep their quotes and escapes. */
function tokenize(line: string): string[] | undefined {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === ' ' || line[i] === '\t') {
      i++;
      continue;
    }
    let token = '';
    if (line[i] === '"') {
      token += '"';
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) token += line.charAt(i++);
        token += line.charAt(i++);
      }
      if (i >= line.length) return undefined; // unterminated string
      token += '"';
      i++;
    } else {
      while (i < line.length && line[i] !== ' ' && line[i] !== '\t') token += line.charAt(i++);
    }
    tokens.push(token);
  }
  return tokens;
}

/** Parses one command line; undefined when a quoted value is not closed. */
export function parseCommand(line: string): WalCommand | undefined {
  const tokens = tokenize(line.trim());
  if (!tokens) return undefined;
  const [verb = '', ...rest] = tokens;
  const params = new Map<string, string | true>();
  const outputs: { variable: string; output: string }[] = [];
  for (let t = 0; t < rest.length; t++) {
    const token = rest[t] ?? '';
    const out = OUTPUT.exec(token);
    if (token.startsWith('--')) {
      const next = rest[t + 1];
      if (next !== undefined && !next.startsWith('--') && !OUTPUT.test(next)) {
        params.set(token.slice(2), next);
        t++;
      } else {
        params.set(token.slice(2), true);
      }
    } else if (out) {
      outputs.push({ variable: out[1] ?? '', output: out[2] ?? '' });
    }
  }
  return { verb, params, outputs };
}

/** Unquotes a WAL string value: `"a \"b\" \\ c"` → `a "b" \ c`; `\r` and `\n` become line breaks. */
export function unquote(value: string): string {
  if (!(value.length >= 2 && value.startsWith('"') && value.endsWith('"'))) return value;
  const body = value.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body.charAt(i);
    if (c === '\\' && i + 1 < body.length) {
      const n = body.charAt(++i);
      out += n === 'r' ? '\r' : n === 'n' ? '\n' : n;
    } else {
      out += c;
    }
  }
  return out;
}
