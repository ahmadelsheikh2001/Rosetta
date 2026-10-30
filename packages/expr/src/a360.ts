import type { AccessStep, Expr } from '@rosetta/ir';

/**
 * A360 expression parser (ADR-006). Grammar verified on corpus 01–04
 * (docs/formats/a360-bot-json.md § Expressions):
 *
 *   text       := ( literal | '$' ref '$' )*
 *   ref        := 'System:' name | name access* conversion?
 *   access     := '[' inner ']' | '{' inner '}'
 *   inner      := '$' ref '$' | digits | key text
 *   conversion := '.' Package ':' function        e.g. $vNum.Number:toString$
 *
 * `$…$` nests inside brackets (`$vDict{$vKey$}$`), so the scanner tracks depth.
 * Escaping of a literal `$` is not known yet (A-07): such input becomes `raw`.
 */

/** Inline conversions seen in the corpus, mapped to canonical IR functions. */
const conversions: Readonly<Record<string, string>> = {
  'Number:toString': 'convert.toString',
  'Boolean:toString': 'convert.toString',
};

class ExprError extends Error {}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;

/** Index of the `$` that closes the reference starting at `start`, honouring nested brackets. */
function closingDollar(text: string, start: number): number {
  const stack: string[] = [];
  const pairs: Record<string, string> = { '[': ']', '{': '}' };
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i);
    const expected = stack.at(-1);
    if (c === '[' || c === '{') stack.push(pairs[c] ?? '');
    else if (c === ']' || c === '}') {
      if (c !== expected) throw new ExprError(`unbalanced "${c}" at ${i}`);
      stack.pop();
    } else if (c === '$') {
      if (stack.length === 0) return i;
      // nested reference inside brackets: skip to its own closing `$`
      i = closingDollar(text, i + 1);
    }
  }
  throw new ExprError('unclosed "$"');
}

function parseInner(inner: string): Expr {
  if (inner.startsWith('$') && inner.endsWith('$') && inner.length > 2) {
    return parseRef(inner.slice(1, -1));
  }
  if (/^\d+$/.test(inner)) return { kind: 'literal', value: Number(inner) };
  if (inner.includes('$')) throw new ExprError(`unsupported key "${inner}"`);
  // Record columns with spaces are quoted: `$CsvTxtRow{"Company Name"}$`, `$CsvTxtRow{State}$`.
  const quoted = /^"(.*)"$/.exec(inner);
  return { kind: 'literal', value: quoted ? (quoted[1] ?? '') : inner };
}

/** Parses the content between the `$` delimiters of one reference. */
function parseRef(body: string): Expr {
  if (body.startsWith('System:')) {
    const name = body.slice('System:'.length);
    if (!NAME.test(name) || NAME.exec(name)?.[0] !== name) {
      throw new ExprError(`bad system variable "${body}"`);
    }
    return { kind: 'system', name: `a360:${name}` };
  }

  const head = NAME.exec(body)?.[0];
  if (head === undefined) throw new ExprError(`bad variable reference "${body}"`);
  let i = head.length;
  const path: AccessStep[] = [];

  while (i < body.length && (body[i] === '[' || body[i] === '{')) {
    const open = body.charAt(i);
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let j = i;
    for (; j < body.length; j++) {
      const c = body.charAt(j);
      if (c === '$') {
        j = closingDollar(body, j + 1);
        continue;
      }
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (j >= body.length || body.charAt(j) !== close) throw new ExprError(`unclosed "${open}"`);
    const inner = parseInner(body.slice(i + 1, j));
    path.push(open === '[' ? { kind: 'index', index: inner } : { kind: 'key', key: inner });
    i = j + 1;
  }

  const ref: Expr = { kind: 'var', name: head, path };
  if (i === body.length) return ref;

  const conversion = /^\.([A-Za-z]+):([A-Za-z]+)$/.exec(body.slice(i));
  if (!conversion) throw new ExprError(`unexpected "${body.slice(i)}" after ${head}`);
  const key = `${conversion[1] ?? ''}:${conversion[2] ?? ''}`;
  return { kind: 'call', fn: conversions[key] ?? `a360:${key}`, args: [ref] };
}

/**
 * Parses an A360 `expression` value. Never throws: unparsable input is
 * returned as a `raw` expression with the reason.
 */
export function parseA360(text: string): Expr {
  try {
    const parts: Expr[] = [];
    let literal = '';
    let i = 0;
    while (i < text.length) {
      const c = text.charAt(i);
      if (c !== '$') {
        literal += c;
        i++;
        continue;
      }
      const end = closingDollar(text, i + 1);
      if (end === i + 1) throw new ExprError('empty "$$"');
      if (literal) parts.push({ kind: 'literal', value: literal });
      literal = '';
      parts.push(parseRef(text.slice(i + 1, end)));
      i = end + 1;
    }
    if (literal) parts.push({ kind: 'literal', value: literal });
    if (parts.length === 0) return { kind: 'literal', value: '' };
    if (parts.length === 1 && parts[0]) return parts[0];
    return { kind: 'template', parts };
  } catch (err) {
    if (!(err instanceof ExprError)) throw err;
    return { kind: 'raw', text, dialect: 'a360', reason: err.message };
  }
}
