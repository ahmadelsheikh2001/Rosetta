import type { Expr, IRType } from '@rosetta/ir';

/** An A360 attribute value: `{ type, string | number | boolean | expression | … }` (A-05). */
export type A360Value = Readonly<Record<string, unknown>> & { readonly type: string };

/** Problems met while writing a value; turned into notes by the caller. */
export type Sink = (text: string) => void;

/** IR system values with an A360 equivalent (docs/mappings/a360-to-ibm-rpa.md, reversed). */
const systemValues: Readonly<Record<string, string>> = {
  'ibm-rpa:scriptName': '$System:AATaskName$',
  'a360:AATaskName': '$System:AATaskName$',
  'a360:Machine': '$System:Machine$',
};

/**
 * Renders an expression as A360 expression text (`$var$`, `$list[0]$`, `$dict{key}$`).
 * Inside text, number and boolean variables need an explicit conversion
 * (`$vNum.Number:toString$`, corpus 01 and 03).
 */
export function exprText(e: Expr, types: ReadonlyMap<string, IRType>, sink: Sink): string {
  switch (e.kind) {
    case 'literal':
      if (typeof e.value === 'string' && e.value.includes('{{ROSETTA: ')) {
        // target-wal writes A360 system values WAL lacks as {{ROSETTA: a360:Name}} placeholders
        const text = e.value.replace(/\{\{ROSETTA: a360:(\w+)\}\}/g, '$$System:$1$$');
        if (text.includes('{{ROSETTA: '))
          sink(`Placeholder left in "${e.value}"; replace it in the A360 editor.`);
        return text;
      }
      if (typeof e.value === 'string' && e.value.includes('$'))
        sink(`Text "${e.value}" contains "$", which A360 reads as a variable marker (A-07).`);
      return e.value === null ? '' : String(e.value);
    case 'var': {
      let out = e.name;
      for (const step of e.path) {
        const inner = step.kind === 'index' ? step.index : step.key;
        // a list index takes the number itself (`$list[$i$]$`), not its text
        const text =
          inner.kind === 'literal'
            ? String(inner.value)
            : step.kind === 'index' && inner.kind === 'var' && inner.path.length === 0
              ? `$${inner.name}$`
              : `$${exprText(inner, types, sink).replace(/^\$|\$$/g, '')}$`;
        out += step.kind === 'index' ? `[${text}]` : `{${text}}`;
      }
      const kind = e.path.length === 0 ? types.get(e.name)?.kind : undefined;
      if (kind === 'number') return `$${out}.Number:toString$`;
      if (kind === 'boolean') return `$${out}.Boolean:toString$`;
      return `$${out}$`;
    }
    case 'template':
      return e.parts.map((p) => exprText(p, types, sink)).join('');
    case 'system': {
      const known = systemValues[e.name];
      if (known) return known;
      sink(`System value ${e.name} has no A360 equivalent.`);
      return '';
    }
    case 'call':
      if (e.fn === 'convert.toString' && e.args[0]) return exprText(e.args[0], types, sink);
      sink(`Function ${e.fn} has no A360 form yet.`);
      return '';
    case 'raw':
      sink(`Source expression could not be read: ${e.text}`);
      return '';
    case 'binary':
    case 'unary':
      sink('Operator expressions inside text are not supported yet.');
      return '';
  }
}

/** A lone variable reference, written without a conversion (`$vNum$`). */
const bareRef = (e: Expr): string | undefined =>
  e.kind === 'var' && e.path.length === 0 ? `$${e.name}$` : undefined;

export function stringValue(e: Expr, types: ReadonlyMap<string, IRType>, sink: Sink): A360Value {
  if (
    e.kind === 'literal' &&
    typeof e.value === 'string' &&
    !e.value.includes('$') &&
    !e.value.includes('{{ROSETTA: ')
  )
    return { type: 'STRING', string: e.value };
  if (e.kind === 'literal' && e.value !== null && typeof e.value !== 'string')
    return { type: 'STRING', string: String(e.value) };
  return { type: 'STRING', expression: exprText(e, types, sink) };
}

export function numberValue(e: Expr, types: ReadonlyMap<string, IRType>, sink: Sink): A360Value {
  if (e.kind === 'literal' && typeof e.value === 'number')
    return { type: 'NUMBER', number: String(e.value) };
  if (e.kind === 'literal' && typeof e.value === 'string' && /^-?\d+(\.\d+)?$/.test(e.value))
    return { type: 'NUMBER', number: e.value };
  return { type: 'NUMBER', expression: bareRef(e) ?? exprText(e, types, sink) };
}

export function booleanValue(e: Expr, types: ReadonlyMap<string, IRType>, sink: Sink): A360Value {
  if (e.kind === 'literal' && typeof e.value === 'boolean')
    return { type: 'BOOLEAN', boolean: e.value };
  return { type: 'BOOLEAN', expression: bareRef(e) ?? exprText(e, types, sink) };
}

export function datetimeValue(e: Expr, types: ReadonlyMap<string, IRType>, sink: Sink): A360Value {
  return { type: 'DATETIME', expression: bareRef(e) ?? exprText(e, types, sink) };
}

/** Windows path → A360 FILE value (`file:///C:/dir/file`, percent-encoded; corpus 05, 09). */
export function fileValue(e: Expr, types: ReadonlyMap<string, IRType>, sink: Sink): A360Value {
  if (e.kind === 'literal' && typeof e.value === 'string') {
    const path = e.value.replace(/\\/g, '/');
    return { type: 'FILE', string: `file:///${encodeURI(path)}` };
  }
  // corpus 04: a variable path is written `file://$vFilePath$`
  return { type: 'FILE', expression: `file://${exprText(e, types, sink)}` };
}

export const variableRef = (name: string): A360Value => ({ type: 'VARIABLE', variableName: name });
