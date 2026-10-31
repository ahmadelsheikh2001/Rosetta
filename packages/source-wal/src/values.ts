import type { AccessStep, Expr } from '@rosetta/ir';
import { unquote } from './tokens.js';

const literal = (value: string | number | boolean): Expr => ({ kind: 'literal', value });

/**
 * One `${…}` reference: a variable, a property (`${table.Rows}`), a list item (`${list[1]}`, WAL
 * indexes start at 1, the IR at 0) or an environment value (`${rpa:scriptName}`).
 */
function reference(body: string): Expr {
  if (body.startsWith('rpa:')) return { kind: 'system', name: `ibm-rpa:${body.slice(4)}` };
  const m = /^([A-Za-z_]\w*)(.*)$/.exec(body);
  if (!m) return { kind: 'raw', text: `\${${body}}`, dialect: 'ibm-rpa', reason: 'reference' };
  const path: AccessStep[] = [];
  let rest = m[2] ?? '';
  while (rest !== '') {
    const prop = /^\.(\w+)/.exec(rest);
    const index = /^\[(\d+)\]/.exec(rest);
    if (prop) {
      path.push({ kind: 'key', key: literal(prop[1] ?? '') });
      rest = rest.slice(prop[0].length);
    } else if (index) {
      path.push({ kind: 'index', index: literal(Number(index[1]) - 1) });
      rest = rest.slice(index[0].length);
    } else {
      return { kind: 'raw', text: `\${${body}}`, dialect: 'ibm-rpa', reason: 'reference' };
    }
  }
  return { kind: 'var', name: m[1] ?? '', path };
}

/** Text with `${…}` references → literal, a lone reference, or a template. */
function text(value: string): Expr {
  const parts: Expr[] = [];
  let last = 0;
  for (const m of value.matchAll(/\$\{([^}]*)\}/g)) {
    if (m.index > last) parts.push(literal(value.slice(last, m.index)));
    parts.push(reference(m[1] ?? ''));
    last = m.index + m[0].length;
  }
  if (last < value.length) parts.push(literal(value.slice(last)));
  if (parts.length === 0) return literal('');
  if (parts.length === 1 && parts[0]) return parts[0];
  return { kind: 'template', parts };
}

/**
 * A WAL parameter value → IR expression. Quoted values are text (Studio round 1: a quoted number
 * is text, "Not a number"); bare numbers and `True`/`False` are literals.
 */
export function walValue(raw: string | true): Expr {
  if (raw === true) return literal(true);
  if (raw.startsWith('"')) return text(unquote(raw));
  if (raw === 'True' || raw === 'False') return literal(raw === 'True');
  if (/^-?\d+(\.\d+)?$/.test(raw)) return literal(Number(raw));
  return text(raw);
}
