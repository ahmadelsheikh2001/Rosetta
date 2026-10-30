/**
 * WAL commands the generator may write, with what Studio 30.0.2 requires of them.
 * Source per command: `verified` (accepted by Studio, corpus/ibm/probe-30.0.2) or
 * `documented` (IBM RPA 30.0.x reference, present in the Studio toolbox).
 * Used by the static checker to catch mistakes before a script reaches Studio.
 */
export interface CommandSpec {
  readonly evidence: 'verified' | 'documented';
  /** Every input parameter the command accepts. */
  readonly params: readonly string[];
  /** Parameters that must be present. Alternatives: `a|b` (one of them). */
  readonly required?: readonly string[];
  /** Accepted values of enumeration parameters. */
  readonly enums?: Readonly<Record<string, readonly string[]>>;
}

const operators = [
  'Equal_To',
  'Greater_Than',
  'Greater_Than_Equal_To',
  'Less_Than',
  'Less_Than_Equal_To',
  'Contains',
  'Begins_With',
  'Ends_With',
  'Matches',
  'Is_True',
  'Is_Empty',
  'Is_Null',
  'Is_Null_Or_Empty',
];
const condition: CommandSpec = {
  evidence: 'verified',
  params: ['left', 'operator', 'right', 'negate'],
  required: ['left', 'operator'],
  enums: { operator: operators },
};
const bare: CommandSpec = { evidence: 'verified', params: [] };
/** Selector types the generator writes for web elements (documented `selector` options). */
const webSelectors = ['Id', 'Name', 'IdAndName', 'CssSelector', 'XPath'];

export const walCommands: Readonly<Record<string, CommandSpec>> = {
  // variables
  defVar: {
    evidence: 'verified',
    params: ['name', 'type', 'innertype', 'value', 'parameter', 'output', 'required'],
    required: ['name', 'type'],
  },
  setVar: { evidence: 'verified', params: ['name', 'value'], required: ['name', 'value'] },
  // flow control
  if: condition,
  elseIf: condition,
  else: bare,
  endIf: bare,
  while: condition,
  endWhile: bare,
  do: { evidence: 'documented', params: [] },
  loopWhile: { ...condition, evidence: 'documented' },
  for: {
    evidence: 'verified',
    params: ['variable', 'from', 'to', 'step'],
    required: ['variable', 'from', 'to', 'step'],
  },
  next: bare,
  foreach: {
    evidence: 'verified',
    params: ['collection', 'variable', 'distinct'],
    required: ['collection', 'variable'],
  },
  endFor: bare,
  break: bare,
  continue: bare,
  goSub: { evidence: 'verified', params: ['label', 'assignments'], required: ['label'] },
  beginSub: { evidence: 'verified', params: ['name'], required: ['name'] },
  endSub: bare,
  return: bare,
  // errors
  onError: {
    evidence: 'verified',
    params: ['executenext', 'label'],
    required: ['label|executenext'],
  },
  recover: bare,
  failTest: { evidence: 'verified', params: ['message'], required: ['message'] },
  // text
  trimString: {
    evidence: 'verified',
    params: ['text', 'trimoption'],
    required: ['text', 'trimoption'],
    enums: { trimoption: ['TrimStart', 'TrimEnd', 'TrimStartAndEnd'] },
  },
  getSubString: {
    evidence: 'verified',
    params: ['text', 'start', 'length'],
    required: ['text', 'start'],
  },
  replaceText: {
    evidence: 'verified',
    params: ['texttoparse', 'useregex', 'pattern', 'regexOptions', 'textpattern', 'replacement'],
    required: ['texttoparse', 'textpattern|pattern'],
  },
  splitString: {
    evidence: 'verified',
    params: [
      'text',
      'delimiteroption',
      'standarddelimiter',
      'customdelimiter',
      'count',
      'limit',
      'isregularexpression',
      'length',
    ],
    required: ['text', 'delimiteroption'],
    enums: { delimiteroption: ['StandardDelimiter', 'CustomDelimiter', 'LengthDelimiter'] },
  },
  changeTextCase: {
    evidence: 'verified',
    params: ['text', 'type'],
    required: ['text', 'type'],
    enums: { type: ['Upper', 'Lower', 'Title', 'Sentence'] },
  },
  getStringLength: { evidence: 'verified', params: ['text'], required: ['text'] },
  parseText: {
    evidence: 'verified',
    params: ['text', 'useRegex', 'query', 'regexPattern', 'regexOptions', 'startindex'],
    required: ['text', 'startindex', 'query|regexPattern'],
  },
  // numbers
  evaluate: { evidence: 'documented', params: ['expression'], required: ['expression'] },
  incrementVar: { evidence: 'documented', params: ['number'], required: ['number'] },
  convertStringToNumber: {
    evidence: 'verified',
    params: [
      'text',
      'allowleadingsign',
      'allowdecimalpoint',
      'allowthousands',
      'allowexponent',
      'allowcurrencysymbol',
      'culture',
    ],
    required: ['text', 'culture'],
  },
  convertNumberToText: {
    evidence: 'verified',
    params: ['number', 'conversiontype', 'decimals', 'usethousandseparator', 'culture'],
    required: ['number', 'conversiontype'],
    enums: {
      conversiontype: [
        'SimpleNumber',
        'ExtendedNumber',
        'SimpleMoney',
        'ExtendedMoney',
        'SimplePercentage',
        'ExtendedPercentage',
      ],
    },
  },
  // dates
  getCurrentDateAndTime: {
    evidence: 'verified',
    params: ['localorutc', 'getcurrentdateonly'],
    required: ['localorutc'],
    enums: { localorutc: ['LocalTime', 'UTCTime'] },
  },
  addToDateTime: {
    evidence: 'verified',
    params: ['date', 'value', 'type'],
    required: ['date', 'value', 'type'],
    enums: { type: ['Days', 'Hours', 'Minutes', 'Months', 'Seconds', 'Years'] },
  },
  dateTimeToText: {
    evidence: 'verified',
    params: ['culture', 'date', 'usecustomformat', 'customformat', 'standardformat'],
    required: ['date', 'customformat|standardformat'],
  },
  // collections
  add: {
    evidence: 'documented',
    params: ['collection', 'value'],
    required: ['collection', 'value'],
  },
  get: { evidence: 'verified', params: ['collection', 'index'], required: ['collection', 'index'] },
  strDictAdd: {
    evidence: 'verified',
    params: ['usevariable', 'keyvalue', 'key', 'value', 'dictionary'],
    required: ['dictionary', 'key|keyvalue'],
  },
  strDictGet: {
    evidence: 'verified',
    params: ['key', 'dictionary'],
    required: ['key', 'dictionary'],
  },
  // files, environment, user interface
  writeToFile: {
    evidence: 'verified',
    params: [
      'value',
      'createrandomfile',
      'file',
      'encoding',
      'overwrite',
      'writeasnewline',
      'fileSystem',
    ],
    required: ['value', 'file|createrandomfile'],
  },
  readCSV: {
    evidence: 'documented',
    params: ['filepath', 'delimiter', 'hasheaders', 'encoding', 'missingfieldaction'],
    required: ['filepath', 'delimiter'],
  },
  getEnvVar: {
    evidence: 'verified',
    params: ['name', 'target'],
    required: ['name', 'target'],
    enums: { target: ['Process', 'Machine', 'User'] },
  },
  messageBox: {
    evidence: 'verified',
    params: ['title', 'text', 'icon', 'buttons', 'defaultbutton'],
    required: ['title', 'text'],
    enums: { icon: ['Error', 'Information', 'Question', 'Warning'] },
  },
  logMessage: {
    evidence: 'documented',
    params: ['message', 'type'],
    required: ['message', 'type'],
  },
  // Windows / Office (corpus 05; verified in Studio round 9)
  excelOpen: {
    evidence: 'verified',
    params: [
      'file',
      'passwordtopen',
      'passwordtomodify',
      'usetemplate',
      'template',
      'savechanges',
      'notcalculate',
    ],
    required: ['file'],
  },
  excelSet: {
    evidence: 'verified',
    params: [
      'value',
      'isformula',
      'file',
      'getfirstsheet',
      'sheet',
      'usingcell',
      'cell',
      'row',
      'column',
    ],
    required: ['file', 'getfirstsheet|sheet', 'cell|row'],
  },
  excelGetTable: {
    evidence: 'verified',
    params: [
      'file',
      'getfirstsheet',
      'sheet',
      'entiretable',
      'userange',
      'range',
      'fromrow',
      'fromcolumn',
      'torow',
      'tocolumn',
      'hasheaders',
    ],
    required: ['file', 'getfirstsheet|sheet'],
  },
  excelClose: {
    evidence: 'verified',
    params: ['file', 'save', 'notcalculate'],
    required: ['file'],
  },
  mapTableRow: {
    evidence: 'verified',
    params: ['dataTable', 'row', 'mappings'],
    required: ['dataTable', 'row', 'mappings'],
  },
  // Browser (corpus 09): classic web commands; accepted by Studio 30.0.2 in round 10
  webStart: {
    evidence: 'verified',
    params: [
      'name',
      'type',
      'userprofilepreferences',
      'enableextensions',
      'extensionsFolder',
      'disablegpu',
      'bypassExternalProtocols',
      'useproxy',
      'isautodetect',
      'username',
      'password',
    ],
    // userprofilepreferences: optional in the reference, required by Studio 30.0.2 (round 10)
    required: ['name', 'type', 'userprofilepreferences'],
    enums: {
      type: ['Chrome', 'Edge', 'Firefox', 'InternetExplorer'],
      userprofilepreferences: ['AutomationOptimized', 'UserProfileOptmized', 'StrictUserProfile'],
    },
  },
  webNavigate: { evidence: 'verified', params: ['url'], required: ['url'] },
  webSet: {
    evidence: 'verified',
    params: ['value', 'selector', 'id', 'name', 'css', 'xpath', 'simulatehuman', 'timeout'],
    required: ['value', 'selector'],
    enums: { selector: webSelectors },
  },
  webSetComboBox: {
    evidence: 'verified',
    params: [
      'selectoptionby',
      'value',
      'matchbytext',
      'index',
      'nowait',
      'selector',
      'id',
      'name',
      'css',
      'innertext',
      'tagname',
      'xpath',
      'simulatehuman',
      'timeout',
    ],
    required: ['selectoptionby', 'selector'],
    enums: { selector: webSelectors },
  },
  webClick: {
    evidence: 'verified',
    params: [
      'isdoubleclick',
      'nowait',
      'selector',
      'id',
      'name',
      'css',
      'linktext',
      'innertext',
      'tagname',
      'xpath',
      'class',
      'elementvalue',
      'simulatehuman',
      'timeout',
    ],
    required: ['selector'],
    enums: { selector: webSelectors },
  },
  webClose: { evidence: 'verified', params: ['name', 'leavebrowseropen'], required: ['name'] },
  // Base / General (corpus 08; verified in Studio rounds 8-9)
  getVaultItem: {
    evidence: 'verified',
    params: ['name', 'system'],
    required: ['name'],
  },
  executeScript: {
    evidence: 'verified',
    params: ['handleError', 'isfromfile', 'filename', 'name', 'parameters', 'output', 'version'],
    required: ['name'],
  },
};
