import type { ActionStmt, Expr } from '@rosetta/ir';
import { pathOf, textOf, valueOf, type NoteSink } from './expr.js';
import { quote, ref } from './syntax.js';
import type { NoteInput, WalWriter } from './writer.js';

/** Lowering state shared across one bot. */
export interface LowerState {
  /** CSV session name → file path expression, from `csv.open` (A360 sessions, A-12-like). */
  readonly csvSessions: Map<string, Expr>;
}

type Lowerer = (a: ActionStmt, w: WalWriter, s: LowerState) => void;

const v = (n: string): NoteInput => ({ kind: 'verify', assumption: 'W-18', text: n });
const verify = (assumption: string, text: string): NoteInput => ({
  kind: 'verify',
  assumption,
  text,
});
const semantic = (text: string): NoteInput => ({ kind: 'semantic', text });

function helpers(a: ActionStmt, w: WalWriter) {
  const pending: NoteInput[] = [];
  const sink: NoteSink = (n) => pending.push(n);
  const arg = (name: string): Expr | undefined => a.args[name];
  const str = (name: string): string | undefined => {
    const e = arg(name);
    return e?.kind === 'literal' && e.value !== null ? String(e.value) : undefined;
  };
  const val = (name: string) => valueOf(arg(name) ?? { kind: 'literal', value: '' }, sink);
  const text = (name: string) => quote(textOf(arg(name) ?? { kind: 'literal', value: '' }, sink));
  const out = (key = 'result') => a.outputs[key]?.name;
  /** Writes the line and flushes notes raised while building it. */
  const emit = (line: string, ...notes: NoteInput[]) => {
    w.line(line, ...pending.splice(0), ...notes);
  };
  return { arg, str, val, text, out, emit, sink, pending };
}

/** Writes a TODO for an action with no WAL form yet. */
export function manual(a: ActionStmt, w: WalWriter, why: string): void {
  w.comment(`TODO [ROSETTA] ${a.op}: ${why}`, { kind: 'manual', text: `${a.op}: ${why}` });
}

const assignment = (target: string | undefined, value: string) =>
  `setVar --name "${ref(target ?? '?')}" --value ${value}`;

/** Canonical op → WAL. Every command name and parameter here is a draft (W-xx). */
export const lowerers: Readonly<Record<string, Lowerer>> = {
  'variable.assign': (a, w) => {
    const h = helpers(a, w);
    const value = a.args.sourceString
      ? h.text('sourceString')
      : a.args.input
        ? h.val('input')
        : undefined;
    if (value !== undefined) {
      h.emit(assignment(h.out(), value), verify('W-03', 'setVar'));
      return;
    }
    if (h.str('source') === 'constant') {
      h.emit(
        assignment(h.out(), h.str('userDefined') === 'true' ? 'True' : 'False'),
        verify('W-03', 'setVar with a boolean'),
      );
      return;
    }
    manual(a, w, 'assignment form not recognised');
  },
  'number.increment': (a, w) => {
    const h = helpers(a, w);
    const expr = `${textOf(a.args.source ?? { kind: 'literal', value: 0 }, h.sink)} + ${textOf(a.args.by ?? { kind: 'literal', value: 1 }, h.sink)}`;
    h.emit(
      `evaluate --expression ${quote(expr)} ${h.out() ?? '?'}=value`,
      verify('W-18', 'evaluate with an arithmetic expression and `var=value` output'),
    );
  },
  'number.toString': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      assignment(h.out(), h.text('input')),
      semantic(
        `Number to text through interpolation; A360 "digits after decimal" = ${h.str('numFormatDigits') ?? '?'} is not applied.`,
      ),
    );
  },
  'datetime.assign': (a, w) => {
    const h = helpers(a, w);
    const src = a.args.dateTime;
    if (src?.kind === 'system' && src.name === 'a360:Date') {
      h.emit(
        `getCurrentDateAndTime --localorutc "LocalTime" ${h.out() ?? '?'}=value`,
        v('getCurrentDateAndTime'),
      );
      return;
    }
    h.emit(assignment(h.out(), h.val('dateTime')), verify('W-03', 'setVar with a DateTime'));
  },
  'list.add': (a, w) => {
    const h = helpers(a, w);
    const list = a.args.sourceList;
    if (h.str('itemPosition') !== 'END' || list?.kind !== 'var') {
      manual(a, w, 'only "add at end of list" is supported');
      return;
    }
    h.emit(`add --collection "${ref(list.name)}" --value ${h.val('listItem')}`, v('add to a List'));
  },
  'dict.put': (a, w) => {
    const h = helpers(a, w);
    const dict = a.args.sourceMap;
    if (h.str('varOrManual') !== 'Manual' || dict?.kind !== 'var') {
      manual(a, w, 'only a static value is supported');
      return;
    }
    h.emit(
      `add --collection "${ref(dict.name)}" --key ${h.val('key')} --value ${h.val('stringVal')}`,
      v('add to a StringDictionary'),
    );
  },
  'dialog.message': (a, w) => {
    const h = helpers(a, w);
    const autoClose = a.args.closeMsgBox?.kind === 'literal' && a.args.closeMsgBox.value === true;
    h.emit(
      `messageBox --title ${h.text('title')} --text ${h.text('content')} --icon "Information" --buttons "OK" --defaultbutton "FirstButton"`,
      v('messageBox parameters'),
      ...(autoClose
        ? [semantic('A360 closes this message box automatically; not reproduced.')]
        : []),
    );
  },
  'file.appendText': (a, w) => {
    const h = helpers(a, w);
    const notes: NoteInput[] = [v('writeToFile; whether it appends or overwrites')];
    if (a.args.appendTimestamp?.kind === 'literal' && a.args.appendTimestamp.value === true) {
      notes.push(semantic('A360 prefixes each line with a timestamp; not reproduced.'));
    }
    if (h.str('encodingValue') && h.str('encodingValue') !== 'UTF-8') {
      notes.push(
        semantic(`A360 encoding ${h.str('encodingValue') ?? ''}; WAL default encoding used.`),
      );
    }
    h.emit(
      `writeToFile --value ${h.text('logContent')} --file ${pathOf(a.args.filePath ?? { kind: 'literal', value: '' }, h.sink)}`,
      ...notes,
    );
  },
  'file.appendVariables': (a, w) => {
    manual(
      a,
      w,
      'no WAL equivalent for "log variables to file"; write each variable with writeToFile',
    );
  },
  'string.trim': (a, w) => {
    const h = helpers(a, w);
    const start =
      a.args.trimAtBeginning?.kind === 'literal' && a.args.trimAtBeginning.value === true;
    const end = a.args.trimAtEnd?.kind === 'literal' && a.args.trimAtEnd.value === true;
    const option = start && end ? 'TrimStartAndEnd' : start ? 'TrimStart' : 'TrimEnd';
    h.emit(
      `trimString --text ${h.text('sourceString')} --trimoption "${option}" ${h.out() ?? '?'}=value`,
      v('trimString'),
    );
  },
  'string.substring': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `getSubString --text ${h.text('sourceString')} --start ${h.val('startIndex')} --length ${h.val('subStringLength')} ${h.out() ?? '?'}=value`,
      v('getSubString'),
      verify('A-19', 'A360 start index is 1-based; confirm WAL uses the same base.'),
    );
  },
  'string.replace': (a, w) => {
    const h = helpers(a, w);
    const notes: NoteInput[] = [v('replaceText')];
    if (h.str('isCaseSensitive') === 'false')
      notes.push(
        semantic('A360 replace is case-insensitive here; WAL replaceText may be case-sensitive.'),
      );
    if (h.str('isRegularExpression') === 'true')
      notes.push(semantic('A360 uses a regular expression here.'));
    h.emit(
      `replaceText --texttoparse ${h.text('sourceString')} --textpattern ${h.text('find')} --replacement ${h.text('replaceWith')} ${h.out() ?? '?'}=value`,
      ...notes,
    );
  },
  'string.split': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `splitString --text ${h.text('sourceString')} --delimiteroption "CustomDelimiter" --customdelimiter ${h.text('delimiter')} ${h.out() ?? '?'}=value`,
      v('splitString'),
    );
  },
  'string.upper': (a, w) => {
    const h = helpers(a, w);
    h.emit(`toUpper --text ${h.text('sourceString')} ${h.out() ?? '?'}=value`, v('toUpper'));
  },
  'string.lower': (a, w) => {
    const h = helpers(a, w);
    h.emit(`toLower --text ${h.text('sourceString')} ${h.out() ?? '?'}=value`, v('toLower'));
  },
  'string.length': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `getStringLength --text ${h.text('sourceString')} ${h.out() ?? '?'}=value`,
      v('getStringLength'),
    );
  },
  'string.indexOf': (a, w) => {
    manual(a, w, 'WAL "find text position" command not identified yet');
  },
  'string.toNumber': (a, w) => {
    manual(a, w, 'WAL text-to-number command not identified yet');
  },
  'datetime.add': (a, w) => {
    manual(a, w, 'WAL date arithmetic command not identified yet');
  },
  'datetime.format': (a, w) => {
    manual(a, w, 'WAL date formatting command not identified yet');
  },
  'csv.open': (a, w, s) => {
    const session = a.args.session?.kind === 'literal' ? String(a.args.session.value) : 'Default';
    if (a.args.filePath) s.csvSessions.set(session, a.args.filePath);
    w.comment(`CSV session "${session}" opened here; WAL reads the file in one step below.`);
  },
  'csv.read': (a, w, s) => {
    const h = helpers(a, w);
    const session = a.args.session?.kind === 'literal' ? String(a.args.session.value) : 'Default';
    const path = s.csvSessions.get(session);
    if (!path) {
      manual(a, w, `CSV session "${session}" was not opened in this bot`);
      return;
    }
    h.emit(
      `readCSV --filepath ${pathOf(path, h.sink)} ${h.out() ?? '?'}=value`,
      {
        kind: 'manual',
        assumption: 'W-18',
        text: 'readCSV requires --delimiter (Studio round 1); its value syntax is not known yet.',
      },
      semantic('A360 options (header, delimiter, trimming, encoding) are not applied.'),
    );
  },
};
