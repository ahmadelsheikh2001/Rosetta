import type { ActionStmt, Expr, IRType, UITarget } from '@rosetta/ir';
import { pathOf, textOf, valueOf, type NoteSink } from './expr.js';
import { quote, ref, regexLiteral } from './syntax.js';
import type { NoteInput, WalWriter } from './writer.js';

/** Lowering state shared across one bot. */
export interface LowerState {
  /** CSV session name → file and header flag, from `csv.open`. */
  readonly csvSessions: Map<string, { readonly path: Expr; readonly header: boolean }>;
  /** Excel session name → Excel instance variable, from `excel.open`. */
  readonly excelSessions: Map<string, ExcelSession>;
  /** Source variable types, by name. */
  readonly varTypes: ReadonlyMap<string, IRType>;
  /** Credential variables backed by the A360 vault → credential name. */
  readonly vaultCredentials: ReadonlyMap<string, string>;
  /** Browser instances started with webStart; each needs a webClose (Studio round 10). */
  readonly browsers: Set<string>;
  /** Declares a helper variable once per key and returns its name. */
  readonly helper: (key: string, defVar: (name: string) => string) => string;
}

export interface ExcelSession {
  /** `Excel` variable holding the instance. */
  readonly handle: string;
  /** A360 "Contains header": the first row holds the column names. */
  readonly header: boolean;
  /** A360 "Save workbook" ran: WAL saves on close. */
  saved: boolean;
  /** Sheet chosen with "Switch to sheet" or "Create workbook", as WAL text; else the first sheet. */
  sheet?: string;
}

/** Sheet parameter of an Excel command: the session's sheet, or the first sheet. */
export const sheetArg = (session: ExcelSession): string =>
  session.sheet ? `--sheet ${session.sheet}` : '--getfirstsheet';

type Lowerer = (a: ActionStmt, w: WalWriter, s: LowerState) => void;

const sessionName = (a: ActionStmt): string =>
  a.args.session?.kind === 'literal' ? String(a.args.session.value) : 'Default';

/** The Excel session an action works on; writes a TODO when it was not opened in this bot. */
function excelSession(a: ActionStmt, w: WalWriter, s: LowerState): ExcelSession | undefined {
  const found = s.excelSessions.get(sessionName(a));
  if (!found) manual(a, w, `Excel session "${sessionName(a)}" was not opened in this bot`);
  return found;
}

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

const browserTypes: Readonly<Record<string, string>> = {
  CHROME: 'Chrome',
  EDGE: 'Edge',
  FIREFOX: 'Firefox',
};

/** Seconds → TimeSpan text `hh:mm:ss` (documented `--timeout "00:00:05"`). */
const timeSpan = (seconds: number): string =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');

/**
 * The WAL selector for a captured web element: the HTML id when A360 used it, else the XPath,
 * else the CSS selector (documented selector types Id, XPath, CssSelector).
 */
function webSelector(t: UITarget): { args: string; label: string } | undefined {
  const pick = (kind: string) => t.strategies.find((x) => x.kind === kind && x.enabled)?.value;
  const id = pick('id');
  if (id) return { args: `--selector "Id" --id ${quote(id)}`, label: `the id "${id}"` };
  const xpath = pick('xpath');
  if (xpath) return { args: `--selector "XPath" --xpath ${quote(xpath)}`, label: 'the XPath' };
  const css = pick('css');
  if (css)
    return { args: `--selector "CssSelector" --css ${quote(css)}`, label: 'the CSS selector' };
  return undefined;
}

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
  // A-25: same shape as increment
  'number.decrement': (a, w) => {
    const h = helpers(a, w);
    const expr = `${textOf(a.args.source ?? { kind: 'literal', value: 0 }, h.sink)} - ${textOf(a.args.by ?? { kind: 'literal', value: 1 }, h.sink)}`;
    h.emit(`evaluate --expression ${quote(expr)} ${h.out()}=value`, doc('evaluate'));
  },
  // A-25: Delay "regular" waits a fixed time; WAL delay takes a time span (documented)
  'flow.delay': (a, w) => {
    const h = helpers(a, w);
    if (h.str('delayType') !== 'REGULAR') {
      manual(a, w, `delay type ${h.str('delayType') ?? '?'} not supported (only a fixed time)`);
      return;
    }
    const time = h.str('delayTime');
    const unit = h.str('timeUnit');
    const ms = { MILLISECONDS: 1, SECONDS: 1000, MINUTES: 60000 }[unit ?? ''];
    if (time === undefined || !/^\d+(\.\d+)?$/.test(time) || ms === undefined) {
      manual(
        a,
        w,
        `delay of ${time ?? 'a variable'} ${unit ?? ''} not converted (only a fixed number)`,
      );
      return;
    }
    const total = Math.round(Number(time) * ms);
    const pad = (n: number, size = 2) => String(n).padStart(size, '0');
    const span = `${pad(Math.floor(total / 3600000))}:${pad(Math.floor(total / 60000) % 60)}:${pad(Math.floor(total / 1000) % 60)}${total % 1000 ? `.${pad(total % 1000, 3)}` : ''}`;
    h.emit(`delay --timeout ${span}`, doc('delay'));
  },
  // A-25: Folder / File create (documented createDir; writeToFile creates a missing file)
  'folder.create': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `createDir --path ${h.text('folderPath')}`,
      doc('createDir'),
      ...(h.flag('isOverwrite')
        ? [semantic('A360 replaces an existing folder; WAL createDir keeps it and its files.')]
        : []),
    );
  },
  'file.create': (a, w) => {
    const h = helpers(a, w);
    h.emit(
      `writeToFile --value "" --file ${pathOf(a.args.filePath ?? { kind: 'literal', value: '' }, h.sink)}${h.flag('isOverwrite') ? ' --overwrite' : ''}`,
      doc('writeToFile with empty content (creates the file)'),
    );
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
    const h = helpers(a, w);
    const session = sessionName(a);
    if (a.args.filePath)
      s.csvSessions.set(session, { path: a.args.filePath, header: h.flag('containsHeader') });
    w.comment(
      `CSV session "${session}" opened here; WAL reads the file in one step (readCSV) below.`,
    );
  },
  'csv.read': (a, w, s) => {
    const h = helpers(a, w);
    const session = sessionName(a);
    const csv = s.csvSessions.get(session);
    if (!csv) {
      manual(a, w, `CSV session "${session}" was not opened in this bot`);
      return;
    }
    h.emit(
      `readCSV --filepath ${pathOf(csv.path, h.sink)} --delimiter ","${csv.header ? ' --hasheaders' : ''} ${h.out()}=value`,
      doc('readCSV'),
    );
  },
  'csv.close': (a, w) => {
    w.comment(`CSV session "${sessionName(a)}" closed here; WAL keeps no file open (readCSV).`);
  },
  // Browser and Recorder (corpus 09). Classic web commands: the Smart Web commands need 30.0.3.
  'browser.open': (a, w, s) => {
    const h = helpers(a, w);
    const type = browserTypes[h.str('browser') ?? ''];
    if (!type) {
      manual(a, w, `browser ${h.str('browser') ?? '?'} not supported`);
      return;
    }
    s.browsers.add('browser');
    // --userprofilepreferences is required by Studio although documented as optional (round 10).
    h.emit(
      `webStart --name browser --type "${type}" --userprofilepreferences "AutomationOptimized"`,
      doc('webStart (Start Browser)'),
    );
    h.emit(`webNavigate --url ${h.text('url')}`, doc('webNavigate'));
  },
  'ui.capture': (a, w) => {
    const h = helpers(a, w);
    const selector = a.target ? webSelector(a.target) : undefined;
    if (a.target?.technology !== 'web' || !selector) {
      manual(a, w, 'only web page elements with an id, XPath or CSS selector are converted');
      return;
    }
    const wait = a.args.wait?.kind === 'literal' ? Number(a.args.wait.value) : NaN;
    const timeout = Number.isFinite(wait) && wait > 0 ? ` --timeout "${timeSpan(wait)}"` : '';
    const notes: NoteInput[] = [];
    if (a.target.strategies.filter((x) => x.enabled).length > 1)
      notes.push(
        semantic(
          `A360 matches all enabled properties of the captured element; WAL uses ${selector.label} only.`,
        ),
      );
    const action =
      h.str('textboxAction') ??
      h.str('comboboxAction') ??
      h.str('radioAction') ??
      h.str('checkboxAction') ??
      h.str('buttonAction');
    if (h.str('textboxAction') === 'SETTEXT') {
      h.emit(
        `webSet --value ${h.text('value')} ${selector.args}${timeout}`,
        doc('webSet (Set Value to Field)'),
        ...notes,
      );
    } else if (h.str('comboboxAction') === 'SELECTITEMBYTEXT') {
      h.emit(
        `webSetComboBox --selectoptionby "MatchByText" --matchbytext ${h.text('value')} ${selector.args}${timeout}`,
        doc('webSetComboBox (Select Item in Combo Box)'),
        ...notes,
      );
    } else if (
      h.str('buttonAction') === 'CLICK' ||
      h.str('radioAction') === 'CLICK' ||
      h.str('radioAction') === 'SELECT' ||
      h.str('checkboxAction') === 'CHECK'
    ) {
      if (h.str('checkboxAction') === 'CHECK')
        notes.push(
          semantic(
            'A360 checks the box; WAL clicks it, which unchecks a box that is already checked.',
          ),
        );
      h.emit(`webClick ${selector.args}${timeout}`, doc('webClick (Click on Web Page)'), ...notes);
    } else {
      manual(a, w, `Recorder action ${action ?? '(none)'} not supported yet`);
    }
  },
  // Excel advanced (Excel_MS), corpus 05. A360 names a session; WAL keeps an Excel variable.
  'excel.open': (a, w, s) => {
    const h = helpers(a, w);
    const session = sessionName(a);
    if (h.str('excelSourceOption') !== 'desktopfilepath') {
      manual(a, w, `workbook source "${h.str('excelSourceOption') ?? '?'}" not supported`);
      return;
    }
    if (h.flag('isSecure')) {
      manual(a, w, 'password-protected workbook: read the password from the vault');
      return;
    }
    const handle = s.helper(
      `excel${session.replace(/\W/g, '')}`,
      (n) => `defVar --name ${n} --type Excel`,
    );
    s.excelSessions.set(session, { handle, header: h.flag('containsHeader'), saved: false });
    const notes: NoteInput[] = [doc('excelOpen')];
    if (h.str('fileAccessMode') === 'READONLY')
      notes.push(
        semantic('A360 opens the workbook read-only; WAL excelOpen opens it for editing.'),
      );
    if (h.flag('isSpecificSheet'))
      notes.push({
        kind: 'manual',
        text: 'A360 activates a specific sheet; WAL commands below use the first sheet.',
      });
    h.emit(
      `excelOpen --file ${pathOf(a.args.filePath ?? { kind: 'literal', value: '' }, h.sink)} ${handle}=value`,
      ...notes,
    );
  },
  'excel.setCell': (a, w, s) => {
    const h = helpers(a, w);
    const session = excelSession(a, w, s);
    if (!session) return;
    if (h.str('cellOption') !== 'SPECIFIC_CELL') {
      manual(
        a,
        w,
        `cell option ${h.str('cellOption') ?? '?'} not supported (only a specific cell)`,
      );
      return;
    }
    h.emit(
      `excelSet --value ${h.text('value')} --file ${ref(session.handle)} ${sheetArg(session)} --usingcell --cell ${h.text('cell')}`,
      doc('excelSet (Set Value in Excel)'),
      ...(session.sheet
        ? []
        : [semantic('A360 writes to the active sheet; WAL writes to the first sheet.')]),
    );
  },
  // Create workbook (A-25): excelOpen on a path that does not exist creates the file (documented)
  'excel.create': (a, w, s) => {
    const h = helpers(a, w);
    const session = sessionName(a);
    const handle = s.helper(
      `excel${session.replace(/\W/g, '')}`,
      (n) => `defVar --name ${n} --type Excel`,
    );
    const sheet = a.args.sheetName ? h.text('sheetName') : undefined;
    s.excelSessions.set(session, {
      handle,
      header: false,
      saved: false,
      ...(sheet ? { sheet } : {}),
    });
    h.emit(
      `excelOpen --file ${pathOf(a.args.filePath ?? { kind: 'literal', value: '' }, h.sink)} ${handle}=value`,
      doc('excelOpen on a new file path (creates the workbook)'),
      semantic('A360 creates the workbook here; WAL writes it when it is closed with --save.'),
      ...(h.flag('isOverwrite')
        ? [
            semantic(
              'A360 replaces an existing file; WAL excelOpen opens it instead. Delete the file first if it may exist.',
            ),
          ]
        : []),
      ...(sheet
        ? [
            semantic(
              `A360 names the first sheet ${sheet}; WAL writes to a sheet of that name, added next to the default first sheet.`,
            ),
          ]
        : []),
    );
  },
  // Excel commands name their sheet in WAL (excelSet --sheet); A360 switches the active one
  'excel.switchSheet': (a, w, s) => {
    const h = helpers(a, w);
    const session = excelSession(a, w, s);
    if (!session) return;
    if (h.str('sheetOption') !== 'BYNAME') {
      manual(a, w, `sheet option ${h.str('sheetOption') ?? '?'} not supported (only by name)`);
      return;
    }
    session.sheet = h.text('sheetName');
    w.comment(`A360 Switch to sheet ${session.sheet}: the Excel commands below name this sheet`);
  },
  'excel.createSheet': (a, w, s) => {
    const h = helpers(a, w);
    const session = excelSession(a, w, s);
    if (!session) return;
    if (h.str('sheetOption') !== 'BYNAME') {
      manual(a, w, `sheet option ${h.str('sheetOption') ?? '?'} not supported (only by name)`);
      return;
    }
    // excelSet creates a sheet it does not find (documented); A1 of a new sheet is empty anyway
    h.emit(
      `excelSet --value "" --file ${ref(session.handle)} --sheet ${h.text('sheetName')} --usingcell --cell "A1"`,
      doc('excelSet --sheet (creates a missing sheet)'),
    );
  },
  'excel.save': (a, w, s) => {
    const session = excelSession(a, w, s);
    if (!session) return;
    session.saved = true;
    // No documented save for an Excel instance: officeSave works on Office applications.
    w.comment('A360 Save workbook: WAL saves the workbook when it is closed (excelClose --save)', {
      kind: 'semantic',
      text: 'A360 saves here; WAL saves when the workbook is closed. Changes are lost if the bot fails before the close.',
    });
  },
  'excel.close': (a, w, s) => {
    const h = helpers(a, w);
    const session = excelSession(a, w, s);
    if (!session) return;
    const save = h.flag('isSave') || session.saved;
    h.emit(
      `excelClose --file ${ref(session.handle)}${save ? ' --save' : ''}`,
      doc('excelClose'),
      ...(session.saved && !h.flag('isSave')
        ? [
            semantic(
              'A360 closes without saving changes made after "Save workbook"; WAL saves them too.',
            ),
          ]
        : []),
    );
  },
  'credential.assign': (a, w, s) => {
    // setVar does not accept SecureString variables (Studio round 8), and WAL has no other way
    // to copy one. A copy of a vault credential is read from the vault again instead.
    const h = helpers(a, w);
    const src = a.args.stringVar;
    const credential = src?.kind === 'var' ? s.vaultCredentials.get(src.name) : undefined;
    if (!credential) {
      manual(a, w, 'WAL cannot copy a SecureString (setVar rejects it); read it from the vault');
      return;
    }
    h.emit(`getVaultItem --name ${quote(credential)} ${h.out()}=password`, {
      kind: 'semantic',
      text: `A360 copies ${src?.kind === 'var' ? src.name : 'the credential'}; WAL reads the same vault credential again (setVar rejects SecureString, round 8).`,
    });
  },
};
