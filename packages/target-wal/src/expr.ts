import type { Expr } from '@rosetta/ir';
import { LIST_INDEX_BASE, quote, ref, systemValues, walBoolean } from './syntax.js';
import type { NoteInput } from './writer.js';

/** Collects notes raised while lowering one expression. */
export type NoteSink = (note: NoteInput) => void;

/** Placeholder for content we cannot express; visible in Studio and listed in notes. */
const placeholder = (what: string, sink: NoteSink, text: string): string => {
  sink({ kind: 'manual', text });
  return `{{ROSETTA: ${what}}}`;
};

/**
 * Renders an expression as the text inside a quoted WAL value.
 * Templates concatenate; inline conversions to text are implicit in WAL (W-04).
 */
export function textOf(expr: Expr, sink: NoteSink): string {
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'boolean') return walBoolean(expr.value);
      return expr.value === null ? '' : String(expr.value);
    case 'var': {
      let out = expr.name;
      for (const step of expr.path) {
        const inner = step.kind === 'index' ? step.index : step.key;
        if (inner.kind === 'literal' && typeof inner.value === 'number' && step.kind === 'index') {
          sink({
            kind: 'verify',
            assumption: 'A-19',
            text: `List index ${inner.value} (A360, 0-based) written as ${inner.value + LIST_INDEX_BASE}; confirm the WAL index base.`,
          });
          out += `[${inner.value + LIST_INDEX_BASE}]`;
        } else if (inner.kind === 'literal') {
          sink({
            kind: 'verify',
            assumption: 'W-04',
            text: `Dictionary key access written as ${expr.name}[${String(inner.value)}].`,
          });
          out += `[${String(inner.value)}]`;
        } else if (inner.kind === 'var' && inner.path.length === 0) {
          sink({
            kind: 'verify',
            assumption: 'W-04',
            text: `Variable used as key/index (${inner.name}) inside a reference.`,
          });
          out += `[${ref(inner.name)}]`;
        } else {
          return placeholder(
            `complex access on ${expr.name}`,
            sink,
            `Access path on ${expr.name} could not be written.`,
          );
        }
      }
      return ref(out);
    }
    case 'template':
      return expr.parts.map((p) => textOf(p, sink)).join('');
    case 'call':
      if (expr.fn === 'convert.toString' && expr.args[0]) return textOf(expr.args[0], sink);
      return placeholder(expr.fn, sink, `Function ${expr.fn} has no WAL form yet.`);
    case 'system': {
      const known = systemValues[expr.name];
      if (known) {
        sink({
          kind: 'verify',
          assumption: 'W-18',
          text: `System value ${expr.name} written as ${known.ref} (documented).`,
        });
        return known.ref;
      }
      return placeholder(expr.name, sink, `System value ${expr.name} has no WAL equivalent.`);
    }
    case 'raw':
      return placeholder(
        `unread expression`,
        sink,
        `Source expression could not be read: ${expr.text}`,
      );
    case 'binary':
    case 'unary':
      return placeholder(
        'operation',
        sink,
        'Operator expressions inside text are not supported yet.',
      );
  }
}

/** Renders an expression as a WAL parameter value: bare number/boolean, otherwise quoted. */
export function valueOf(expr: Expr, sink: NoteSink): string {
  if (expr.kind === 'literal') {
    if (typeof expr.value === 'number') return String(expr.value);
    if (typeof expr.value === 'boolean') return walBoolean(expr.value);
  }
  const text = textOf(expr, sink);
  if (text.includes('"')) {
    sink({
      kind: 'verify',
      assumption: 'W-04',
      text: 'Value contains a double quote; escaping is unverified.',
    });
  }
  return quote(text);
}

/**
 * A360 stores paths as `file:///C:/dir/file` or `file://$var$`. WAL takes plain
 * Windows paths.
 */
export function pathOf(expr: Expr, sink: NoteSink): string {
  const strip = (s: string) => s.replace(/^file:\/\/\/?/, '');
  if (expr.kind === 'literal' && typeof expr.value === 'string') {
    return quote(strip(expr.value).replace(/\//g, '\\'));
  }
  if (expr.kind === 'template' && expr.parts[0]?.kind === 'literal') {
    const [first, ...rest] = expr.parts;
    const head = strip(String(first.value));
    return valueOf(
      {
        kind: 'template',
        parts: [...(head ? [{ kind: 'literal' as const, value: head }] : []), ...rest],
      },
      sink,
    );
  }
  return valueOf(expr, sink);
}
