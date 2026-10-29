import type { WalNote } from './writer.js';

const sections: readonly { kind: WalNote['kind']; title: string; intro: string }[] = [
  {
    kind: 'manual',
    title: 'Needs manual work',
    intro: 'Not converted. A `TODO [ROSETTA]` comment marks the place in the script.',
  },
  {
    kind: 'semantic',
    title: 'Converted, behaviour may differ',
    intro: 'Review that the WAL behaves like the A360 command.',
  },
  {
    kind: 'verify',
    title: 'Draft syntax to check in Studio',
    intro:
      'Open the script in IBM RPA Studio 30.0.2. If a line is rejected, send the line number and the exact error text.',
  },
];

/** Renders the notes of one script as a Markdown checklist for the reviewer. */
export function renderNotes(scriptName: string, notes: readonly WalNote[]): string {
  const out = [`# ${scriptName}: conversion notes`, ''];
  out.push(
    `${notes.filter((n) => n.kind === 'manual').length} manual, ${notes.filter((n) => n.kind === 'semantic').length} behaviour, ${notes.filter((n) => n.kind === 'verify').length} syntax checks.`,
    '',
  );
  for (const s of sections) {
    const list = notes.filter((n) => n.kind === s.kind);
    if (list.length === 0) continue;
    out.push(`## ${s.title}`, '', s.intro, '');
    if (s.kind === 'verify') {
      // one row per assumption, listing every line that depends on it
      const byWhat = new Map<string, number[]>();
      for (const n of list) {
        const key = `${n.assumption ?? ''}\u0000${n.text}`;
        byWhat.set(key, [...(byWhat.get(key) ?? []), n.line]);
      }
      out.push('| Assumption | What to check | Lines |', '| --- | --- | --- |');
      for (const [key, lines] of byWhat) {
        const [assumption = '', text = ''] = key.split('\u0000');
        out.push(`| ${assumption} | ${text} | ${[...new Set(lines)].join(', ')} |`);
      }
    } else {
      out.push('| Line | Note | Source |', '| --- | --- | --- |');
      for (const n of list)
        out.push(`| ${n.line} | ${n.text.replace(/\|/g, '\\|')} | ${n.source ?? ''} |`);
    }
    out.push('');
  }
  return out.join('\n');
}
