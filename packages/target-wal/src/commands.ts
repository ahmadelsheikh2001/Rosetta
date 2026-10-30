import type { ActionStmt, Expr, IRType } from '@rosetta/ir';
import { pathOf, textOf, valueOf, type NoteSink } from './expr.js';
import { quote, ref, regexLiteral } from './syntax.js';
import type { NoteInput, WalWriter } from './writer.js';

/** Lowering state shared across one bot. */
export interface LowerState {
  /** CSV session name → file path expression, from `csv.open`. */
  readonly csvSessions: Map<string, Expr>;
  /** Source variable types, by name. */
  readonly varTypes: ReadonlyMap<string, IRType>;
  /** Declares a helper variable once per key and returns its name. */
  readonly helper: (key: string, defVar: (name: string) => string) => string;
}

type Lowerer = (a: ActionStmt, w: WalWriter, s: LowerState) => void;

/** Command taken from the IBM RPA 30.0.x reference, not yet seen in Studio (W-18). */
const doc = (command: string): NoteInput => ({
  kind: 'verify',
  assumption: 'W-18',
  text: `${command} (documented in IBM RPA 30.0.x; confirm in Studio)`,
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
  const flag = (name: string): boolean => {
    const e = arg(name);
    return e?.kind === 'literal' && (e.value === true || e.value === 'true');
  };
  const val = (name: string) => valueOf(arg(name) ?? { kind: 'literal', value: '' }, sink);
  const text = (name: string) => quote(textOf(arg(name) ?? { kind: 'literal', value: '' }, sink));
  /** Value of a Numeric parameter: a lone reference stays bare (round 1: "Not a number"). */
  const num = (name: string) => {
    const e = arg(name);
    if (e?.kind === 'var') return textOf(e, sink);
    return val(name);
  };
  const out = (key = 'result') => a.outputs[key]?.name ?? '?';
  /** Writes the line and flushes notes raised while building it. */
  const emit = (line: string, ...notes: NoteInput[]) => {
    w.line(line, ...pending.splice(0), ...notes);
  };
  return { arg, str, flag, val, text, num, out, emit, sink };
}

/** Writes a TODO for an action with no WAL form yet. */
export function manual(a: ActionStmt, w: WalWriter, why: string): void {
  w.comment(`TODO [ROSETTA] ${a.op}: ${why}`, { kind: 'manual', text: `${a.op}: ${why}` });
}

/** A360 type names as written by "Log variables to file" (corpus 01, run 2). */
const a360TypeNames: Readonly<Record<string, string>> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  datetime: 'Datetime',
  list: 'List',
  dict: 'Dictionary',
  table: 'Table',
  credential: 'Credential',
};

/**
 * A360 log timestamp prefix, e.g. `(10/30/2026 2:06:26 PM) ` (corpus 01, run 2): the current time
 * formatted M/d/yyyy h:mm:ss tt with en-US. Helper lines are written before the log line.
 */
function timestamp(w: WalWriter, s: LowerState): string {
  const now = s.helper('logNow', (n) => `defVar --name ${n} --type DateTime`);
  const text = s.helper('logStamp', (n) => `defVar --name ${n} --type String`);
  w.line(`getCurrentDateAndTime --localorutc "LocalTime" ${now}=value`);
  w.line(
    `dateTimeToText --date "${ref(now)}" --usecustomformat --customformat "M/d/yyyy h:mm:ss tt" --culture en-US ${text}=value`,
    doc('dateTimeToText with --culture en-US'),
  );
  return `(${ref(text)}) `;
}

/** `setVar` is verified in Studio (round 1). */
const assignment = (target: string, value: string) =>
  `setVar --name "${ref(target)}" --value ${value}`;

/**
 * A360 compares case-insensitively here; WAL plain search is case-sensitive, so the literal is
 * searched as an escaped regular expression with IgnoreCase (documented regex options).
 */
function caseInsensitive(h: ReturnType<typeof helpers>, name: string): string | undefined {
  const e = h.arg(name);
  if (
    h.str('isCaseSensitive') !== 'false' ||
    e?.kind !== 'literal' ||
    typeof e.value !== 'string'
  ) {
    return undefined;
  }
  return quote(regexLiteral(e.value));
}

const dateUnits: Readonly<Record<string, string>> = {
  DAYS: 'Days',
  HOURS: 'Hours',
  MINUTES: 'Minutes',
  MONTHS: 'Months',
  SECONDS: 'Seconds',
  YEARS: 'Years',
};

/** Canonical op → WAL (docs/formats/wal-30.0.2.md, docs/mappings/a360-to-ibm-rpa.md). */
export const lowerers: Readonly<Record<string, Lowerer>> = {
  'variable.assign': (a, w) => {
    const h = helpers(a, w);
    if (a.args.sourceString) {
      h.emit(assignment(h.out(), h.text('sourceString')));
      return;
    }
    if (a.args.input) {
      h.emit(assignment(h.out(), h.num('input')));
      return;
    }
    if (h.str('source') === 'constant') {
      h.emit(assignment(h.out(), h.str('userDefined') === 'true' ? 'True' : 'False'));
      return;
    }
    manual(a, w, 'assignment form not recognised');
  },
  'number.increment': (a, w) => {
    const h = helpers(a, w);
    const src = a.args.source;
    const by = a.args.by;
    if (src?.kind === 'var' && src.name === h.out() && by?.kind === 'literal' && by.value === 1) {
      h.emit(`incrementVar --number ${ref(src.name)}`, doc('incrementVar'));
      return;
    }
    const expr = `${textOf(src ?? { kind: 'literal', value: 0 }, h.sink)} + ${textOf(by ?? { kind: 'literal', value: 1 }, h.sink)}`;
    h.emit(`evaluate --expression ${quote(expr)} ${h.out()}=value`, doc('evaluate'));
  },
  'number.toString': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `convertNumberToText --number ${h.num('input')} --conversiontype "SimpleNumber" --decimals ${h.val('numFormatDigits')} ${h.out()}=value`,
      doc('convertNumberToText (conversion type "SimpleNumber")'),
    );
  },
  'string.toNumber': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `convertStringToNumber --text ${h.text('sourceString')} --allowleadingsign --allowdecimalpoint --culture en-US ${h.out()}=value`,
      doc('convertStringToNumber'),
      semantic(
        'A360 parses the number with the bot locale; WAL uses en-US with sign and decimal point allowed.',
      ),
    );
  },
  'datetime.assign': (a, w) => {
    const h = helpers(a, w);
    const src = a.args.dateTime;
    if (src?.kind === 'system' && src.name === 'a360:Date') {
      h.emit(
        `getCurrentDateAndTime --localorutc "LocalTime" ${h.out()}=value`,
        doc('getCurrentDateAndTime'),
      );
      return;
    }
    h.emit(assignment(h.out(), h.val('dateTime')));
  },
  'datetime.add': (a, w) => {
    const h = helpers(a, w);
    const unit = dateUnits[h.str('unit') ?? ''];
    if (!unit) {
      manual(a, w, `date unit ${h.str('unit') ?? '?'} not supported`);
      return;
    }
    h.emit(
      `addToDateTime --date ${h.val('source')} --value ${h.num('val')} --type "${unit}" ${h.out()}=value`,
      doc('addToDateTime'),
    );
  },
  'datetime.format': (a, w) => {
    const h = helpers(a, w);
    if (h.str('selectPattern') !== 'CUSTOM') {
      manual(a, w, 'only custom date patterns are supported');
      return;
    }
    h.emit(
      `dateTimeToText --date ${h.val('source')} --usecustomformat --customformat ${h.text('patternInput')} ${h.out()}=value`,
      doc('dateTimeToText with a custom format'),
      semantic('A360 and WAL both use dd/MM/yyyy-style patterns; check unusual pattern letters.'),
    );
  },
  'list.add': (a, w) => {
    const h = helpers(a, w);
    const list = a.args.sourceList;
    if (h.str('itemPosition') !== 'END' || list?.kind !== 'var') {
      manual(a, w, 'only "add at end of list" is supported');
      return;
    }
    h.emit(
      `add --collection "${ref(list.name)}" --value ${h.val('listItem')}`,
      doc('add (Add to Collection)'),
    );
  },
  'dict.put': (a, w) => {
    const h = helpers(a, w);
    const dict = a.args.sourceMap;
    if (h.str('varOrManual') !== 'Manual' || dict?.kind !== 'var') {
      manual(a, w, 'only a static value is supported');
      return;
    }
    h.emit(
      `strDictAdd --key ${h.val('key')} --value ${h.val('stringVal')} --dictionary ${ref(dict.name)}`,
      doc('strDictAdd (Add to String Dictionary)'),
    );
  },
  'dialog.message': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `messageBox --title ${h.text('title')} --text ${h.text('content')} --icon "Information" --buttons "OK" --defaultbutton "FirstButton"`,
      doc('messageBox'),
      ...(h.flag('closeMsgBox')
        ? [semantic('A360 closes this message box automatically; WAL waits for the user.')]
        : []),
    );
  },
  'file.appendText': (a, w, s) => {
    const h = helpers(a, w);
    const notes: NoteInput[] = [
      doc('writeToFile --encoding --writeasnewline (appends unless --overwrite)'),
    ];
    const prefix = h.flag('appendTimestamp') ? timestamp(w, s) : '';
    if (h.str('logOption') !== 'APPEND_FILE')
      notes.push(semantic('A360 overwrites the file here; add --overwrite if intended.'));
    h.emit(
      `writeToFile --value ${quote(prefix + textOf(a.args.logContent ?? { kind: 'literal', value: '' }, h.sink))} --file ${pathOf(a.args.filePath ?? { kind: 'literal', value: '' }, h.sink)} --encoding "Default" --writeasnewline`,
      ...notes,
    );
  },
  'file.appendVariables': (a, w, s) => {
    const h = helpers(a, w);
    const vars = a.args.variables;
    const names =
      vars?.kind === 'call' ? vars.args.filter((x) => x.kind === 'var').map((x) => x.name) : [];
    if (names.length === 0) {
      manual(a, w, 'variable list not recognised');
      return;
    }
    // A360 format (corpus 01, run 2): header, empty line, one "name (Type) = value" line per
    // variable in alphabetical order, 100 dashes.
    const sorted = [...names].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
    const content = [
      'Task bot name : ${rpa:scriptName}',
      '',
      ...sorted.map(
        (n) => `${n} (${a360TypeNames[s.varTypes.get(n)?.kind ?? ''] ?? 'Any'}) = ${ref(n)}`,
      ),
      '-'.repeat(100),
      '',
    ].join('\n');
    h.emit(
      `writeToFile --value ${quote(content)} --file ${pathOf(a.args.filePath ?? { kind: 'literal', value: '' }, h.sink)} --encoding "Default" --writeasnewline`,
      doc('writeToFile'),
      semantic(
        'Same layout as A360. Differences: the bot name is the script name, not the repository path (A-23); Boolean and Datetime values are written in WAL format (A-21).',
      ),
    );
  },
  'string.trim': (a, w) => {
    const h = helpers(a, w);
    const start = h.flag('trimAtBeginning');
    const end = h.flag('trimAtEnd');
    const option = start && end ? 'TrimStartAndEnd' : start ? 'TrimStart' : 'TrimEnd';
    h.emit(
      `trimString --text ${h.text('sourceString')} --trimoption "${option}" ${h.out()}=value`,
      doc('trimString'),
    );
  },
  'string.substring': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `getSubString --text ${h.text('sourceString')} --start ${h.num('startIndex')} --length ${h.num('subStringLength')} ${h.out()}=value`,
      doc('getSubString'),
      {
        kind: 'verify',
        assumption: 'A-19',
        text: 'A360 start index is 1-based; confirm getSubString --start is 1-based too.',
      },
    );
  },
  'string.replace': (a, w) => {
    const h = helpers(a, w);
    const pattern = caseInsensitive(h, 'find');
    if (pattern) {
      h.emit(
        `replaceText --texttoparse ${h.text('sourceString')} --useregex --pattern ${pattern} --regexOptions "IgnoreCase" --replacement ${h.text('replaceWith')} ${h.out()}=value`,
        doc('replaceText with --useregex and IgnoreCase (keeps A360 case-insensitive matching)'),
      );
      return;
    }
    h.emit(
      `replaceText --texttoparse ${h.text('sourceString')} --textpattern ${h.text('find')} --replacement ${h.text('replaceWith')} ${h.out()}=value`,
      doc('replaceText'),
    );
  },
  'string.split': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `splitString --text ${h.text('sourceString')} --delimiteroption "CustomDelimiter" --customdelimiter ${h.text('delimiter')} ${h.out()}=value`,
      doc('splitString'),
    );
  },
  'string.upper': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `changeTextCase --text ${h.text('sourceString')} --type "Upper" ${h.out()}=value`,
      doc('changeTextCase'),
    );
  },
  'string.lower': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `changeTextCase --text ${h.text('sourceString')} --type "Lower" ${h.out()}=value`,
      doc('changeTextCase'),
    );
  },
  'string.length': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `getStringLength --text ${h.text('sourceString')} ${h.out()}=value`,
      doc('getStringLength'),
    );
  },
  'string.indexOf': (a, w) => {
    const h = helpers(a, w);
    const pattern = caseInsensitive(h, 'find');
    if (pattern) {
      h.emit(
        `parseText --text ${h.text('sourceString')} --useRegex --regexPattern ${pattern} --regexOptions "IgnoreCase" --startindex ${h.num('startIndex')} ${h.out()}=value`,
        doc('parseText with --useRegex and IgnoreCase (keeps A360 case-insensitive matching)'),
      );
      return;
    }
    h.emit(
      `parseText --text ${h.text('sourceString')} --query ${h.text('find')} --startindex ${h.num('startIndex')} ${h.out()}=value`,
      doc('parseText (Find Occurrences in Text, 1-based)'),
    );
  },
  'csv.open': (a, w, s) => {
    const session = a.args.session?.kind === 'literal' ? String(a.args.session.value) : 'Default';
    if (a.args.filePath) s.csvSessions.set(session, a.args.filePath);
    w.comment(
      `CSV session "${session}" opened here; WAL reads the file in one step (readCSV) below.`,
    );
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
      `readCSV --filepath ${pathOf(path, h.sink)} --delimiter "," ${h.out()}=value`,
      doc('readCSV'),
    );
  },
};
