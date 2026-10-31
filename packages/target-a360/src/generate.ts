import { createHash } from 'node:crypto';
import {
  walk,
  type ActionStmt,
  type Bot,
  type Expr,
  type IRType,
  type Statement,
  type Variable,
} from '@rosetta/ir';
import {
  booleanValue,
  datetimeValue,
  exprText,
  fileValue,
  numberValue,
  stringValue,
  variableRef,
  type A360Value,
  type Sink,
} from './values.js';

/**
 * Package versions as saved by the Community Edition Control Room in corpus 01–09 (one version
 * each). A360 loads the version a bot names, so only these are known to be available there.
 */
export const packageVersions: Readonly<Record<string, string>> = {
  Boolean: '2.13.3',
  Browser: '4.4.4',
  Comment: '2.17.0',
  Credential: '1.8.0',
  CsvTxt: '2.15.1',
  Datetime: '2.17.3',
  Dictionary: '3.16.2',
  ErrorHandler: '2.13.0-20241115-120032',
  Excel_MS: '6.23.20',
  File: '6.16.2',
  If: '3.8.0-20241115-115929',
  List: '2.16.2',
  LogToFile: '3.11.1',
  Loop: '3.10.0-20251030-061555',
  MessageBox: '3.8.1',
  Number: '3.11.5',
  Recorder: '5.11.0-20260916-081602',
  Step: '2.7.0',
  String: '5.12.6',
  System: '3.18.2',
  TaskBot: '2.10.0-20241119-100739',
};

export interface A360Note {
  /** Path of the node in the generated bot (child indexes), or [] for the bot. */
  readonly kind: 'manual' | 'semantic';
  readonly text: string;
  /** Where it came from in the source, e.g. `trimString @ line 12`. */
  readonly source?: string;
}

export interface A360Bot {
  /** The task bot JSON, as the Control Room stores it (A-24: written back with PUT). */
  readonly json: Readonly<Record<string, unknown>>;
  readonly notes: readonly A360Note[];
}

type Node = Record<string, unknown>;
type Attribute = Record<string, unknown>;

const attr = (name: string, value: A360Value): Attribute => ({ name, value });

/** IR type → A360 variable type (and subtype for lists/dictionaries), corpus 01–09. */
const variableTypes: Readonly<Record<string, string>> = {
  string: 'STRING',
  number: 'NUMBER',
  boolean: 'BOOLEAN',
  datetime: 'DATETIME',
  table: 'TABLE',
  credential: 'CREDENTIAL',
  record: 'RECORD',
};

const operatorCodes: Readonly<Record<string, string>> = { eq: 'EQ', gt: 'GT', lt: 'LT' };

class Generator {
  readonly notes: A360Note[] = [];
  private readonly packages = new Set<string>();
  private readonly types: Map<string, IRType>;
  private readonly loops: string[] = [];
  private loopCount = 0;
  private source: string | undefined;

  constructor(private readonly bot: Bot) {
    this.types = new Map(bot.variables.map((v) => [v.name, v.type]));
  }

  private note(kind: A360Note['kind'], text: string): void {
    this.notes.push({ kind, text, ...(this.source ? { source: this.source } : {}) });
  }

  private sink: Sink = (text) => {
    this.note('manual', text);
  };

  /** Stable uid per node position, so the same input gives the same bot. */
  private uid(path: string): string {
    const h = createHash('sha1').update(`${this.bot.name}/${path}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }

  private node(path: string, pkg: string, command: string, rest: Node): Node {
    this.packages.add(pkg);
    return {
      uid: this.uid(path),
      commandName: command,
      packageName: pkg,
      disabled: false,
      ...rest,
    };
  }

  private todo(path: string, text: string): Node {
    this.note('manual', text);
    return this.node(path, 'Comment', 'Comment', {
      attributes: [attr('comment', { type: 'STRING', string: `TODO [ROSETTA] ${text}` })],
    });
  }

  block(stmts: readonly Statement[], path: string): Node[] {
    return stmts.flatMap((s, i) => {
      const saved = this.source;
      this.source = s.source?.label;
      try {
        const n = this.statement(s, `${path}.${i}`);
        if (!n) return [];
        return s.disabled ? [{ ...n, disabled: true }] : [n];
      } finally {
        this.source = saved;
      }
    });
  }

  private statement(s: Statement, path: string): Node | undefined {
    switch (s.kind) {
      case 'comment':
        return this.node(path, 'Comment', 'Comment', {
          attributes: [attr('comment', { type: 'STRING', string: s.text })],
        });
      case 'group':
        return this.node(path, 'Step', 'step', {
          children: this.block(s.body, path),
          attributes: [attr('title', { type: 'STRING', string: s.label })],
        });
      case 'if':
        return this.ifNode(s, path);
      case 'loop':
        return this.loop(s, path);
      case 'break':
      case 'continue': {
        const anchor = s.target ?? this.loops.at(-1);
        return this.node(path, 'Loop', `loop.commands.${s.kind}`, {
          attributes: anchor ? [attr('anchor', { type: 'STRING', string: anchor })] : [],
        });
      }
      case 'throw':
        return this.node(path, 'ErrorHandler', 'throw', {
          attributes: [
            attr('message', stringValue(s.message, this.types, this.sink)),
            attr('exceptionType', {
              type: 'EXCEPTION',
              exceptionName: 'BotException',
              packageName: 'ErrorHandler',
            }),
          ],
        });
      case 'action':
        return this.action(s, path);
      case 'try':
      case 'callBot':
      case 'stop':
      case 'unknown':
        return this.todo(path, `${s.kind} not converted to A360 yet`);
    }
  }

  /** IR condition → A360 CONDITIONAL attribute, typed by the left side's variable (corpus 02). */
  private condition(e: Expr): Attribute | undefined {
    if (e.kind !== 'binary' || !operatorCodes[e.op]) return undefined;
    const left = e.left;
    const kind =
      left.kind === 'var' && left.path.length === 0 ? this.types.get(left.name)?.kind : undefined;
    const op = attr('operator', { type: 'STRING', string: operatorCodes[e.op] ?? 'EQ' });
    if (kind === 'number')
      return {
        attributes: [
          attr('variable', numberValue(left, this.types, this.sink)),
          op,
          attr('value', numberValue(e.right, this.types, this.sink)),
        ],
        name: 'condition',
        value: { type: 'CONDITIONAL', conditionalName: 'numberVariable', packageName: 'Number' },
      };
    if (kind === 'boolean' && e.op === 'eq')
      return {
        attributes: [
          attr('variable', booleanValue(left, this.types, this.sink)),
          op,
          attr('value', booleanValue(e.right, this.types, this.sink)),
        ],
        name: 'condition',
        value: { type: 'CONDITIONAL', conditionalName: 'booleanVariable', packageName: 'Boolean' },
      };
    if (e.op === 'eq')
      return {
        attributes: [
          attr('variable', { type: 'STRING', expression: exprText(left, this.types, this.sink) }),
          op,
          attr('value', stringValue(e.right, this.types, this.sink)),
          attr('matchCase', { type: 'BOOLEAN', boolean: true }),
          attr('isIgnoreCarriage', { type: 'BOOLEAN', boolean: false }),
        ],
        name: 'condition',
        value: { type: 'CONDITIONAL', conditionalName: 'stringVariable', packageName: 'String' },
      };
    return undefined;
  }

  private conditionOrTodo(e: Expr): Attribute[] {
    const c = this.condition(e);
    if (c) {
      const pkg = (c.value as { packageName: string }).packageName;
      this.packages.add(pkg);
      return [c];
    }
    this.note('manual', 'Condition could not be converted; set it in the A360 editor.');
    return [];
  }

  private ifNode(s: Extract<Statement, { kind: 'if' }>, path: string): Node {
    const [first, ...others] = s.branches;
    const branches: Node[] = others.map((b, i) =>
      this.node(`${path}.b${i}`, 'If', 'elseIf', {
        children: this.block(b.body, `${path}.b${i}`),
        attributes: this.conditionOrTodo(b.condition),
      }),
    );
    if (s.else)
      branches.push(
        this.node(`${path}.else`, 'If', 'else', { children: this.block(s.else, `${path}.else`) }),
      );
    return this.node(path, 'If', 'if', {
      children: this.block(first?.body ?? [], path),
      ...(branches.length ? { branches } : {}),
      attributes: first ? this.conditionOrTodo(first.condition) : [],
    });
  }

  private loop(s: Extract<Statement, { kind: 'loop' }>, path: string): Node {
    const anchor = s.label ?? `Loop${++this.loopCount}`;
    this.loops.push(anchor);
    try {
      const spec = s.loop;
      let attributes: Attribute[];
      if (spec.kind === 'times') {
        attributes = [
          attr('loopType', { type: 'STRING', string: 'ITERATOR' }),
          {
            name: 'iterator',
            ...(spec.indexVar ? { returnTo: variableRef(spec.indexVar.name) } : {}),
            attributes: [attr('times', numberValue(spec.count, this.types, this.sink))],
            value: { type: 'ITERATOR', iteratorName: 'loop.iterators.times', packageName: 'Loop' },
          },
        ];
      } else if (spec.kind === 'while') {
        attributes = [
          attr('loopType', { type: 'STRING', string: 'WHILE' }),
          ...this.conditionOrTodo(spec.condition),
          attr('checkConditionAtEnd', { type: 'BOOLEAN', boolean: spec.checkAtEnd === true }),
        ];
      } else if (spec.collection === 'list' && spec.source.kind === 'var') {
        this.packages.add('List');
        attributes = [
          attr('loopType', { type: 'STRING', string: 'ITERATOR' }),
          {
            name: 'iterator',
            returnTo: variableRef(spec.itemVar.name),
            attributes: [
              attr('list', variableRef(spec.source.name)),
              attr('forOptions', { type: 'STRING', string: 'all' }),
            ],
            value: { type: 'ITERATOR', iteratorName: 'list.iterators.list', packageName: 'List' },
          },
        ];
      } else {
        return this.todo(path, `loop over ${spec.collection} not converted to A360 yet`);
      }
      return this.node(path, 'Loop', 'loop.commands.start', {
        children: this.block(s.body, path),
        anchor: { type: 'STRING', string: anchor },
        attributes,
      });
    } finally {
      this.loops.pop();
    }
  }

  private action(a: ActionStmt, path: string): Node {
    const verb = a.op.startsWith('vendor:ibm-rpa/') ? a.op.slice('vendor:ibm-rpa/'.length) : a.op;
    const write = commands[verb];
    if (!write) return this.todo(path, `${verb} has no A360 conversion yet`);
    const result = write(a, {
      types: this.types,
      sink: this.sink,
      note: (kind, text) => {
        this.note(kind, text);
      },
    });
    if (!result) return this.todo(path, `${verb}: this form is not converted to A360 yet`);
    return this.node(path, result.pkg, result.command, {
      attributes: result.attributes,
      ...(result.returnTo ? { returnTo: variableRef(result.returnTo) } : {}),
    });
  }

  variables(vars: readonly Variable[]): Node[] {
    return vars.flatMap((v) => {
      if (isHelper(v.name)) return [];
      if (v.type.kind === 'handle') return []; // Excel / browser instances are sessions in A360
      const list = v.type.kind === 'list' || v.type.kind === 'dict';
      const type = list
        ? v.type.kind === 'list'
          ? 'LIST'
          : 'DICTIONARY'
        : variableTypes[v.type.kind];
      if (!type) {
        this.note('manual', `Variable ${v.name}: type ${v.type.kind} has no A360 equivalent yet.`);
        return [];
      }
      const node: Node = {
        name: v.name,
        description: v.description ?? '',
        type,
        readOnly: false,
        input: v.direction === 'input' || v.direction === 'inout',
        output: v.direction === 'output' || v.direction === 'inout',
      };
      if (list) {
        const of = (v.type as { of: IRType }).of;
        node.subtype = variableTypes[of.kind] ?? 'STRING';
      }
      const d = v.defaultValue;
      if (type === 'CREDENTIAL') {
        this.note(
          'manual',
          `Credential ${v.name}: choose its locker, credential and attribute in the A360 editor.`,
        );
      } else if (d?.kind === 'literal' && d.value !== null) {
        if (type === 'STRING') node.defaultValue = { type, string: String(d.value) };
        if (type === 'NUMBER') node.defaultValue = { type, number: String(d.value) };
        if (type === 'BOOLEAN') node.defaultValue = { type, boolean: d.value === true };
      } else if (d?.kind === 'call' && d.fn === 'dict.of' && type === 'DICTIONARY') {
        const entries = [];
        for (let k = 0; k + 1 < d.args.length; k += 2) {
          const key = d.args[k];
          const value = d.args[k + 1];
          entries.push({
            key: key?.kind === 'literal' ? String(key.value) : '',
            value: { type: 'STRING', string: value?.kind === 'literal' ? String(value.value) : '' },
            entryType: 'STRING',
          });
        }
        node.defaultValue = { type, dictionary: entries };
      } else if (d?.kind === 'call' && d.fn === 'list.of' && type === 'LIST') {
        node.defaultValue = {
          type,
          list: d.args.map((x) => ({
            type: 'STRING',
            string: x.kind === 'literal' ? String(x.value) : '',
          })),
        };
      }
      return [node];
    });
  }

  packageList(): Node[] {
    return [...this.packages].sort().map((name) => ({
      name,
      version: packageVersions[name] ?? '',
      settingsAttributes: [],
    }));
  }
}

interface CommandContext {
  readonly types: ReadonlyMap<string, IRType>;
  readonly sink: Sink;
  readonly note: (kind: A360Note['kind'], text: string) => void;
}

interface CommandResult {
  readonly pkg: string;
  readonly command: string;
  readonly attributes: Attribute[];
  readonly returnTo?: string;
}

type CommandWriter = (a: ActionStmt, c: CommandContext) => CommandResult | undefined;

/** The variable a WAL command writes: `out=value` or `setVar --name "${x}"`. */
const target = (a: ActionStmt): string | undefined => {
  const out = a.outputs.value;
  if (out) return out.name;
  const name = a.args.name;
  return name?.kind === 'var' && name.path.length === 0 ? name.name : undefined;
};
const arg = (a: ActionStmt, name: string): Expr => a.args[name] ?? { kind: 'literal', value: '' };
const flag = (a: ActionStmt, name: string): boolean => {
  const e = a.args[name];
  return e?.kind === 'literal' && e.value === true;
};
const literalText = (a: ActionStmt, name: string): string | undefined => {
  const e = a.args[name];
  return e?.kind === 'literal' && typeof e.value === 'string' ? e.value : undefined;
};

/** String command with `sourceString` and a result variable (corpus 03 shapes). */
const stringCommand =
  (
    command: string,
    extra: (a: ActionStmt, c: CommandContext) => Attribute[] = () => [],
  ): CommandWriter =>
  (a, c) => {
    const out = target(a);
    if (!out) return undefined;
    return {
      pkg: 'String',
      command,
      attributes: [
        attr('sourceString', stringValue(arg(a, 'text'), c.types, c.sink)),
        ...extra(a, c),
      ],
      returnTo: out,
    };
  };

/** WAL verb → A360 command, reversing docs/mappings/a360-to-ibm-rpa.md. */
export const commands: Readonly<Record<string, CommandWriter>> = {
  setVar: (a, c) => {
    const out = target(a);
    const value = arg(a, 'value');
    const kind = out ? c.types.get(out)?.kind : undefined;
    if (!out) return undefined;
    if (kind === 'number')
      return {
        pkg: 'Number',
        command: 'assignToNumber',
        attributes: [attr('input', numberValue(value, c.types, c.sink))],
        returnTo: out,
      };
    if (kind === 'boolean') {
      if (value.kind !== 'literal' || typeof value.value !== 'boolean') return undefined;
      return {
        pkg: 'Boolean',
        command: 'assign',
        attributes: [
          attr('source', { type: 'STRING', string: 'constant' }),
          attr('userDefined', { type: 'STRING', string: String(value.value) }),
        ],
        returnTo: out,
      };
    }
    if (kind === 'string' || kind === undefined)
      return {
        pkg: 'String',
        command: 'assign',
        attributes: [attr('sourceString', stringValue(value, c.types, c.sink))],
        returnTo: out,
      };
    return undefined;
  },
  messageBox: (a, c) => ({
    pkg: 'MessageBox',
    command: 'messageBox',
    attributes: [
      attr('title', stringValue(arg(a, 'title'), c.types, c.sink)),
      attr('content', stringValue(arg(a, 'text'), c.types, c.sink)),
      attr('scrollLines', { type: 'NUMBER', number: '30' }),
      attr('closeMsgBox', { type: 'BOOLEAN', boolean: false }),
    ],
  }),
  writeToFile: (a, c) => {
    const logOption = attr('logOption', {
      type: 'STRING',
      string: flag(a, 'overwrite') ? 'OVERWRITE_FILE' : 'APPEND_FILE',
    });
    const names = loggedVariables(arg(a, 'value'));
    if (names)
      return {
        pkg: 'LogToFile',
        command: 'logVariablesToFile',
        attributes: [
          attr('filePath', fileValue(arg(a, 'file'), c.types, c.sink)),
          logOption,
          attr('appendTimestamp', { type: 'BOOLEAN', boolean: false }),
          // VARIABLEMAP stores names lower-cased (corpus 01)
          attr('variables', {
            type: 'VARIABLEMAP',
            variableMapNames: names.map((n) => n.toLowerCase()),
          }),
        ],
      };
    const { content, timestamp } = withoutTimestamp(arg(a, 'value'));
    return {
      pkg: 'LogToFile',
      command: 'logToFile',
      attributes: [
        attr('filePath', fileValue(arg(a, 'file'), c.types, c.sink)),
        attr('logContent', stringValue(content, c.types, c.sink)),
        attr('appendTimestamp', { type: 'BOOLEAN', boolean: timestamp }),
        logOption,
        attr('encodingValue', { type: 'STRING', string: 'ANSI' }),
      ],
    };
  },
  trimString: stringCommand('trim', (a) => {
    const option = literalText(a, 'trimoption') ?? 'TrimStartAndEnd';
    return [
      attr('trimAtBeginning', { type: 'BOOLEAN', boolean: option !== 'TrimEnd' }),
      attr('trimAtEnd', { type: 'BOOLEAN', boolean: option !== 'TrimStart' }),
    ];
  }),
  getStringLength: stringCommand('length'),
  convertStringToNumber: stringCommand('toNumber'),
  changeTextCase: (a, c) => {
    const type = literalText(a, 'type');
    const command = type === 'Upper' ? 'uppercase' : type === 'Lower' ? 'lowercase' : undefined;
    return command ? stringCommand(command)(a, c) : undefined;
  },
  getSubString: stringCommand('subString', (a, c) => [
    attr('startIndex', numberValue(arg(a, 'start'), c.types, c.sink)),
    attr('subStringLength', numberValue(arg(a, 'length'), c.types, c.sink)),
    attr('returnBlankIfRangeNotFound', { type: 'BOOLEAN', boolean: false }),
  ]),
  replaceText: (a, c) => {
    const out = target(a);
    if (!out) return undefined;
    const regex = flag(a, 'useregex');
    // RPA Rosetta writes case-insensitive A360 searches as an escaped regex with IgnoreCase
    const pattern = regex ? arg(a, 'pattern') : arg(a, 'textpattern');
    const literal =
      regex && pattern.kind === 'literal'
        ? String(pattern.value).replace(/\\(.)/g, '$1')
        : undefined;
    if (regex && literal === undefined) return undefined;
    return {
      pkg: 'String',
      command: 'replace',
      attributes: [
        attr('sourceString', stringValue(arg(a, 'texttoparse'), c.types, c.sink)),
        attr(
          'find',
          literal !== undefined
            ? { type: 'STRING', string: literal }
            : stringValue(pattern, c.types, c.sink),
        ),
        attr('isCaseSensitive', { type: 'STRING', string: regex ? 'false' : 'true' }),
        attr('isRegularExpression', { type: 'STRING', string: 'false' }),
        attr('startIndex', { type: 'NUMBER', number: '1' }),
        attr('count', { type: 'NUMBER', number: '-1' }),
        attr('replaceWith', stringValue(arg(a, 'replacement'), c.types, c.sink)),
      ],
      returnTo: out,
    };
  },
  splitString: stringCommand('split', (a, c) => [
    attr('delimiter', stringValue(arg(a, 'customdelimiter'), c.types, c.sink)),
    attr('isCaseSensitive', { type: 'STRING', string: 'false' }),
    attr('substrings', { type: 'STRING', string: 'ALL' }),
  ]),
  parseText: (a, c) => {
    const out = target(a);
    if (!out) return undefined;
    const regex = flag(a, 'useRegex');
    const pattern = regex ? arg(a, 'regexPattern') : arg(a, 'query');
    const literal =
      regex && pattern.kind === 'literal'
        ? String(pattern.value).replace(/\\(.)/g, '$1')
        : undefined;
    if (regex && literal === undefined) return undefined;
    return {
      pkg: 'String',
      command: 'find',
      attributes: [
        attr('sourceString', stringValue(arg(a, 'text'), c.types, c.sink)),
        attr(
          'find',
          literal !== undefined
            ? { type: 'STRING', string: literal }
            : stringValue(pattern, c.types, c.sink),
        ),
        attr('isCaseSensitive', { type: 'STRING', string: regex ? 'false' : 'true' }),
        attr('isRegularExpression', { type: 'STRING', string: 'false' }),
        attr('startIndex', numberValue(arg(a, 'startindex'), c.types, c.sink)),
      ],
      returnTo: out,
    };
  },
  convertNumberToText: (a, c) => {
    const out = target(a);
    if (!out) return undefined;
    return {
      pkg: 'Number',
      command: 'toString',
      attributes: [
        attr('input', numberValue(arg(a, 'number'), c.types, c.sink)),
        attr(
          'numFormatDigits',
          numberValue(a.args.decimals ?? { kind: 'literal', value: 0 }, c.types, c.sink),
        ),
      ],
      returnTo: out,
    };
  },
  evaluate: (a, c) => {
    const out = target(a);
    const e = a.args.expression;
    const m = e?.kind === 'template' ? e.parts : undefined;
    const [ref, plus] = m ?? [];
    const step = plus?.kind === 'literal' ? /^ \+ (-?\d+(\.\d+)?)$/.exec(String(plus.value)) : null;
    if (!out || m?.length !== 2 || ref?.kind !== 'var' || !step) return undefined;
    return {
      pkg: 'Number',
      command: 'increment',
      attributes: [
        attr('source', numberValue(ref, c.types, c.sink)),
        attr('by', { type: 'NUMBER', number: step[1] ?? '1' }),
      ],
      returnTo: out,
    };
  },
  incrementVar: (a, c) => {
    const n = a.args.number;
    if (n?.kind !== 'var') return undefined;
    return {
      pkg: 'Number',
      command: 'increment',
      attributes: [
        attr('source', numberValue(n, c.types, c.sink)),
        attr('by', { type: 'NUMBER', number: '1' }),
      ],
      returnTo: n.name,
    };
  },
  add: (a, c) => {
    const list = a.args.collection;
    if (list?.kind !== 'var') return undefined;
    const item = arg(a, 'value');
    return {
      pkg: 'List',
      command: 'addItem',
      attributes: [
        attr('sourceList', variableRef(list.name)),
        attr(
          'listItem',
          item.kind === 'var' && item.path.length === 0
            ? variableRef(item.name)
            : stringValue(item, c.types, c.sink),
        ),
        attr('itemPosition', { type: 'STRING', string: 'END' }),
      ],
    };
  },
  strDictAdd: (a, c) => {
    const dict = a.args.dictionary;
    if (dict?.kind !== 'var') return undefined;
    return {
      pkg: 'Dictionary',
      command: 'put',
      attributes: [
        attr('sourceMap', variableRef(dict.name)),
        attr('key', stringValue(arg(a, 'key'), c.types, c.sink)),
        attr('varOrManual', { type: 'STRING', string: 'Manual' }),
        attr('subtype', { type: 'STRING', string: 'String' }),
        attr('stringVal', stringValue(arg(a, 'value'), c.types, c.sink)),
      ],
    };
  },
  getCurrentDateAndTime: (a) => {
    const out = target(a);
    if (!out) return undefined;
    return {
      pkg: 'Datetime',
      command: 'assign',
      attributes: [
        attr('option', { type: 'STRING', string: 'variable' }),
        attr('dateTime', { type: 'DATETIME', expression: '$System:Date$' }),
      ],
      returnTo: out,
    };
  },
  addToDateTime: (a, c) => {
    const out = target(a);
    const unit = literalText(a, 'type')?.toUpperCase();
    if (!out || !unit) return undefined;
    return {
      pkg: 'Datetime',
      command: 'add',
      attributes: [
        attr('source', datetimeValue(arg(a, 'date'), c.types, c.sink)),
        attr('val', numberValue(arg(a, 'value'), c.types, c.sink)),
        attr('unit', { type: 'STRING', string: unit }),
      ],
      returnTo: out,
    };
  },
  dateTimeToText: (a, c) => {
    const out = target(a);
    if (!out || !flag(a, 'usecustomformat')) return undefined;
    return {
      pkg: 'Datetime',
      command: 'toString',
      attributes: [
        attr('source', datetimeValue(arg(a, 'date'), c.types, c.sink)),
        attr('selectPattern', { type: 'STRING', string: 'CUSTOM' }),
        attr('patternInput', stringValue(arg(a, 'customformat'), c.types, c.sink)),
      ],
      returnTo: out,
    };
  },
};

/** Generates an A360 task bot from IR (ADR-022 step 2). Unconverted parts become TODO comments. */
export function generateA360(source: Bot): A360Bot {
  const bot = undoHelpers(source);
  const g = new Generator(bot);
  const nodes = g.block(bot.body, 'n');
  const variables = g.variables(bot.variables);
  return {
    json: {
      triggers: [],
      nodes,
      variables,
      packages: g.packageList(),
      properties: {
        botCodeVersion: '7',
        improvedNumberSupport: true,
        timeout: '0s',
        automationPriority: 'PRIORITY_MEDIUM',
        runInChildWindow: false,
        runInChildWindowMode: 'DESKTOP',
      },
      workItemTemplateName: null,
    },
    notes: g.notes,
  };
}

/** Variables RPA Rosetta adds when it writes WAL (target-wal): `rosettaItem1`, `rosettaLogStamp`, … */
const isHelper = (name: string): boolean => /^rosetta[A-Z]/.test(name);

/**
 * Undoes what target-wal writes for A360 features WAL lacks, so a converted bot comes back as A360
 * wrote it: list items and dictionary values read with `get` / `strDictGet` into helper variables
 * become `$list[i]$` / `$dict{key}$` again, and the helper lines of the log timestamp are dropped.
 */
function undoHelpers(bot: Bot): Bot {
  const aliases = new Map<string, Expr>();
  walk(bot.body, (s) => {
    if (s.kind !== 'action') return;
    const out = s.outputs.value?.name;
    if (!out || !isHelper(out)) return;
    const verb = s.op.replace('vendor:ibm-rpa/', '');
    const index = s.args.index;
    const collection = s.args.collection;
    const dict = s.args.dictionary;
    if (
      verb === 'get' &&
      collection?.kind === 'var' &&
      index?.kind === 'literal' &&
      typeof index.value === 'number'
    )
      aliases.set(out, {
        kind: 'var',
        name: collection.name,
        path: [{ kind: 'index', index: { kind: 'literal', value: index.value - 1 } }],
      });
    const envName = s.args.name;
    if (verb === 'getEnvVar' && envName?.kind === 'literal' && envName.value === 'COMPUTERNAME')
      aliases.set(out, { kind: 'system', name: 'a360:Machine' });
    if (verb === 'strDictGet' && dict?.kind === 'var' && s.args.key)
      aliases.set(out, { kind: 'var', name: dict.name, path: [{ kind: 'key', key: s.args.key }] });
  });
  const drop = (s: Statement): boolean => {
    if (s.kind !== 'action') return false;
    const out = s.outputs.value?.name;
    return (
      out !== undefined &&
      (aliases.has(out) || out === 'rosettaLogNow' || out === 'rosettaLogStamp')
    );
  };
  const replace = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(replace);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (
        o.kind === 'var' &&
        typeof o.name === 'string' &&
        Array.isArray(o.path) &&
        o.path.length === 0
      ) {
        const alias = aliases.get(o.name);
        if (alias) return alias;
      }
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, replace(v)]));
    }
    return x;
  };
  const prune = (block: readonly Statement[]): Statement[] =>
    block
      .filter((s) => !drop(s))
      .map((s) => {
        const o: Record<string, unknown> = { ...s };
        if ('body' in s && Array.isArray(s.body)) o.body = prune(s.body as Statement[]);
        if (s.kind === 'if') {
          o.branches = s.branches.map((b) => ({ ...b, body: prune(b.body) }));
          if (s.else) o.else = prune(s.else);
        }
        return o as unknown as Statement;
      });
  const { body, variables } = initialValues(bot.body, bot.variables);
  return { ...bot, variables, body: replace(prune(body)) as Statement[] };
}

/**
 * target-wal writes dictionary defaults (and list defaults it cannot inline) as `strDictAdd` /
 * `add` lines before the bot's own commands. In A360 they are the variables' default values.
 */
function initialValues(
  body: readonly Statement[],
  variables: readonly Variable[],
): { body: Statement[]; variables: Variable[] } {
  const defaults = new Map<string, Expr[]>();
  let i = 0;
  for (; i < body.length; i++) {
    const s = body[i];
    if (s?.kind !== 'action') break;
    const verb = s.op.replace('vendor:ibm-rpa/', '');
    const target =
      verb === 'strDictAdd' ? s.args.dictionary : verb === 'add' ? s.args.collection : undefined;
    const v = target?.kind === 'var' ? variables.find((x) => x.name === target.name) : undefined;
    if (!v || v.defaultValue) break;
    const args = defaults.get(v.name) ?? [];
    if (verb === 'strDictAdd') args.push(s.args.key ?? { kind: 'literal', value: '' });
    args.push(s.args.value ?? { kind: 'literal', value: '' });
    defaults.set(v.name, args);
  }
  return {
    body: body.slice(i),
    variables: variables.map((v) => {
      const args = defaults.get(v.name);
      if (!args) return v;
      return {
        ...v,
        defaultValue: { kind: 'call', fn: v.type.kind === 'dict' ? 'dict.of' : 'list.of', args },
      };
    }),
  };
}

/** `(${rosettaLogStamp}) text` → `text` with A360 appendTimestamp (target-wal writes the prefix). */
function withoutTimestamp(e: Expr): { content: Expr; timestamp: boolean } {
  if (e.kind !== 'template') return { content: e, timestamp: false };
  const [open, stamp, rest, ...more] = e.parts;
  const isStamp = stamp?.kind === 'var' && stamp.name === 'rosettaLogStamp';
  if (open?.kind !== 'literal' || open.value !== '(' || !isStamp || rest?.kind !== 'literal')
    return { content: e, timestamp: false };
  const tail = String(rest.value).replace(/^\) /, '');
  const parts: Expr[] = [...(tail ? [{ kind: 'literal' as const, value: tail }] : []), ...more];
  const content: Expr = parts.length === 1 && parts[0] ? parts[0] : { kind: 'template', parts };
  return { content, timestamp: true };
}

/**
 * The Log variables layout target-wal writes (corpus 01, run 2): `Task bot name : …`, an empty
 * line, then `name (Type) = ${name}` per variable. Returns the variable names, or undefined.
 */
function loggedVariables(e: Expr): string[] | undefined {
  const text = e.kind === 'template' ? e.parts : [e];
  const first = text[0];
  if (first?.kind !== 'literal' || !String(first.value).startsWith('Task bot name : '))
    return undefined;
  const names = text
    .filter((p): p is Extract<Expr, { kind: 'var' }> => p.kind === 'var')
    .map((p) => p.name);
  return names.length ? names : undefined;
}
