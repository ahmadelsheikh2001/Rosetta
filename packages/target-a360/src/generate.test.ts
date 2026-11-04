import { action, bot, comment, lit, ref, tryCatch, variable, type Expr } from '@rosetta/ir';
import { describe, expect, it } from 'vitest';
import { generateA360, packageVersions } from './generate.js';
import { exprText, fileValue } from './values.js';

const types = new Map([
  ['vNum', { kind: 'number' as const }],
  ['vText', { kind: 'string' as const }],
]);
const none = () => undefined;
const nodes = (b: ReturnType<typeof bot>) =>
  generateA360(b).json.nodes as {
    packageName: string;
    commandName: string;
    attributes?: unknown[];
  }[];

describe('values', () => {
  it('writes A360 expressions, converting numbers inside text (corpus 01)', () => {
    const e: Expr = { kind: 'template', parts: [lit('n='), ref('vNum'), lit(' t='), ref('vText')] };
    expect(exprText(e, types, none)).toBe('n=$vNum.Number:toString$ t=$vText$');
    expect(
      exprText(
        { kind: 'var', name: 'vList', path: [{ kind: 'index', index: lit(0) }] },
        types,
        none,
      ),
    ).toBe('$vList[0]$');
    expect(
      exprText(
        { kind: 'var', name: 'vDict', path: [{ kind: 'key', key: lit('city') }] },
        types,
        none,
      ),
    ).toBe('$vDict{city}$');
  });

  it('writes Windows paths as file URIs (corpus 05, 09)', () => {
    expect(fileValue(lit('C:\\Rosetta Test\\log.txt'), types, none)).toEqual({
      type: 'FILE',
      string: 'file:///C:/Rosetta%20Test/log.txt',
    });
  });
});

describe('generateA360', () => {
  it('writes a bot with the corpus properties and only the packages it uses', () => {
    const json = generateA360(bot('b', [comment('hi')])).json;
    expect(json.properties).toMatchObject({ botCodeVersion: '7', runInChildWindowMode: 'DESKTOP' });
    expect(json.packages).toEqual([
      { name: 'Comment', version: packageVersions.Comment, settingsAttributes: [] },
    ]);
  });

  it('gives each node a stable uid', () => {
    const b = bot('b', [comment('hi')]);
    expect(JSON.stringify(generateA360(b).json)).toBe(JSON.stringify(generateA360(b).json));
  });

  it('assigns by the target variable type (String, Number, Boolean)', () => {
    const b = bot(
      'b',
      [
        action('vendor:ibm-rpa/setVar', { args: { name: ref('vText'), value: lit('x') } }),
        action('vendor:ibm-rpa/setVar', { args: { name: ref('vNum'), value: lit(5) } }),
        action('vendor:ibm-rpa/setVar', { args: { name: ref('vFlag'), value: lit(false) } }),
      ],
      {
        variables: [
          variable('vText', { kind: 'string' }),
          variable('vNum', { kind: 'number' }),
          variable('vFlag', { kind: 'boolean' }),
        ],
      },
    );
    expect(nodes(b).map((n) => `${n.packageName}/${n.commandName}`)).toEqual([
      'String/assign',
      'Number/assignToNumber',
      'Boolean/assign',
    ]);
  });

  it('writes Try / Catch / Finally as branches of the try node (corpus 04)', () => {
    const r = generateA360(
      bot(
        'b',
        [
          tryCatch(
            [comment('body')],
            [{ body: [comment('caught')], errorType: 'BotException', errorVar: ref('vText') }],
            [comment('cleanup')],
          ),
        ],
        { variables: [variable('vText', { kind: 'string' })] },
      ),
    );
    expect(r.json.nodes).toMatchObject([
      {
        packageName: 'ErrorHandler',
        commandName: 'try',
        children: [{ packageName: 'Comment' }],
        branches: [
          {
            commandName: 'catch',
            attributes: [
              { name: 'exceptionType', value: { exceptionName: 'BotException' } },
              { name: 'continueOnError', value: { boolean: false } },
            ],
            returns: { errorMessage: { type: 'VARIABLE', variableName: 'vText' } },
            children: [{ packageName: 'Comment' }],
          },
          { commandName: 'finally', children: [{ packageName: 'Comment' }] },
        ],
      },
    ]);
    expect(r.notes).toEqual([]);
  });

  it('writes a TODO comment and a manual note for commands it cannot convert', () => {
    const r = generateA360(bot('b', [action('vendor:ibm-rpa/sendEmail')]));
    expect(r.json.nodes).toMatchObject([
      {
        packageName: 'Comment',
        attributes: [{ value: { string: 'TODO [ROSETTA] sendEmail has no A360 conversion yet' } }],
      },
    ]);
    expect(r.notes).toEqual([{ kind: 'manual', text: 'sendEmail has no A360 conversion yet' }]);
  });

  it('writes vault defaults, credential copies and Run Task Bot back (corpus 08)', () => {
    const vault = (out: string) =>
      action('vendor:ibm-rpa/getVaultItem', {
        args: { name: lit('Login') },
        outputs: { password: ref(out) },
      });
    const r = generateA360(
      bot(
        'b',
        [
          vault('vPwd'),
          action('vendor:ibm-rpa/executeScript', {
            args: {
              name: lit('Child'),
              parameters: lit('{"inName":"Ann"}'),
              output: {
                kind: 'template',
                parts: [lit('{"outText":"'), ref('vText'), lit('"}')],
              },
            },
          }),
          vault('vCopy'),
        ],
        {
          variables: [
            variable('vPwd', { kind: 'credential' }, { sensitive: true }),
            variable('vCopy', { kind: 'credential' }, { sensitive: true }),
            variable('vText', { kind: 'string' }),
          ],
        },
      ),
      { vaultLocker: 'L', botFolder: 'Bots/My Folder' },
    );
    expect(r.json.variables).toContainEqual(
      expect.objectContaining({
        name: 'vPwd',
        defaultValue: {
          type: 'CREDENTIAL',
          credential: { lockerName: 'L', name: 'Login', attributeName: 'password' },
        },
      }),
    );
    expect(r.json.nodes).toMatchObject([
      {
        commandName: 'runTask',
        attributes: [
          {
            value: {
              taskbotInput: { dictionary: [{ key: 'inName', value: { string: 'Ann' } }] },
              taskbotFile: {
                string: 'repository:///Automation%20Anywhere/Bots/My%20Folder/Child',
              },
            },
          },
          {},
          {},
          {},
        ],
        returnTo: {
          type: 'DICTIONARY',
          dictionary: [{ key: 'outText', value: { variableName: 'vText' } }],
        },
      },
      {
        commandName: 'assignToCV',
        attributes: [{ value: { type: 'CREDENTIAL', expression: '$vPwd$' } }],
        returnTo: { variableName: 'vCopy' },
      },
    ]);
    // vCopy is only ever a copy, so its own vault item is not known
    expect(r.notes.map((n) => n.text)).toEqual([
      'Credential vCopy: choose its locker, credential and attribute in the A360 editor.',
    ]);
  });

  it('writes string conditions: is empty, contains, not equal (A-25 operators)', () => {
    const ifOn = (condition: Expr) =>
      ({ id: 'i', kind: 'if', branches: [{ condition, body: [] }] }) as const;
    const r = generateA360(
      bot(
        'b',
        [
          ifOn({ kind: 'call', fn: 'is.empty', args: [ref('vText')] }),
          ifOn({ kind: 'call', fn: 'string.contains', args: [ref('vText'), lit('Plan')] }),
          ifOn({ kind: 'binary', op: 'ne', left: ref('vText'), right: lit('x') }),
          ifOn({
            kind: 'unary',
            op: 'not',
            operand: { kind: 'call', fn: 'is.empty', args: [ref('vText')] },
          }),
        ],
        { variables: [variable('vText', { kind: 'string' })] },
      ),
    );
    const operators = (
      r.json.nodes as {
        attributes: { attributes: { name: string; value: { string?: string } }[] }[];
      }[]
    ).map((n) => n.attributes[0]?.attributes.find((x) => x.name === 'operator')?.value.string);
    expect(operators).toEqual(['EQ', 'INCLUDE', 'NEQ', 'NEQ']);
    expect(r.notes).toEqual([]);
  });

  it('writes a cell on a named sheet as Switch to sheet, once, then Set cell', () => {
    const set = (row: Expr, column: number) =>
      action('vendor:ibm-rpa/excelSet', {
        args: {
          value: lit('v'),
          file: ref('rosettaExcelOut'),
          sheet: lit('Invoice'),
          row,
          column: lit(column),
        },
      });
    const r = generateA360(
      bot('b', [set(lit(3), 2), set(ref('vRow'), 28)], {
        variables: [variable('vRow', { kind: 'number' })],
      }),
    );
    expect(r.json.nodes).toMatchObject([
      { commandName: 'SwitchToSheet', attributes: [{}, { value: { string: 'Invoice' } }, {}] },
      { commandName: 'SetCell', attributes: [{}, { value: { string: 'B3' } }, {}, {}] },
      {
        commandName: 'SetCell',
        attributes: [{}, { value: { expression: 'AB$vRow.Number:toString$' } }, {}, {}],
      },
    ]);
  });

  it('writes logMessage to the log file with its level, and a real regex replace', () => {
    const r = generateA360(
      bot(
        'b',
        [
          action('vendor:ibm-rpa/logMessage', {
            args: { message: lit('Done'), type: lit('Warning') },
          }),
          action('vendor:ibm-rpa/replaceText', {
            args: {
              texttoparse: ref('vText'),
              useregex: lit(true),
              pattern: ref('vPattern'),
              regexOptions: lit('0'),
            },
            outputs: { value: ref('vText') },
          }),
        ],
        {
          variables: [
            variable('vText', { kind: 'string' }),
            variable('vPattern', { kind: 'string' }),
          ],
        },
      ),
      { logFile: 'C:\\Logs\\b.log' },
    );
    expect(r.json.nodes).toMatchObject([
      {
        commandName: 'logToFile',
        attributes: [
          { value: { string: 'file:///C:/Logs/b.log' } },
          { value: { string: '[Warning] Done' } },
          {},
          {},
          {},
        ],
      },
      {
        commandName: 'replace',
        attributes: [
          {},
          { value: { expression: '$vPattern$' } },
          { value: { string: 'true' } },
          { value: { string: 'true' } },
          {},
          {},
          { value: { string: '' } },
        ],
      },
    ]);
    expect(r.notes.map((n) => n.kind)).toEqual(['semantic']);
  });

  it('writes date difference in seconds, arithmetic, and a cell whose column is a variable', () => {
    const r = generateA360(
      bot(
        'b',
        [
          action('vendor:ibm-rpa/dateDifference', {
            args: { subtractdate: ref('dStart'), fromdate: ref('dEnd') },
            outputs: { value: ref('tsTook') },
          }),
          action('vendor:ibm-rpa/evaluate', {
            args: {
              expression: {
                kind: 'template',
                parts: [ref('nA'), lit(' * '), ref('nB'), lit(' / 100')],
              },
            },
            outputs: { value: ref('nA') },
          }),
          action('vendor:ibm-rpa/excelSet', {
            args: {
              value: lit('v'),
              file: ref('rosettaExcelOut'),
              sheet: lit('S'),
              row: ref('nB'),
              column: ref('nA'),
            },
          }),
        ],
        {
          variables: [
            variable('dStart', { kind: 'datetime' }),
            variable('dEnd', { kind: 'datetime' }),
            variable('tsTook', { kind: 'unknown', sourceType: 'TimeSpan' }),
            variable('nA', { kind: 'number' }),
            variable('nB', { kind: 'number' }),
          ],
        },
      ),
    );
    expect(r.json.nodes).toMatchObject([
      {
        commandName: 'differenceBetweenDates',
        attributes: [
          { name: 'source', value: { expression: '$dStart$' } },
          { name: 'target', value: { expression: '$dEnd$' } },
          { name: 'unit', value: { string: 'SECONDS' } },
        ],
      },
      {
        commandName: 'assignToNumber',
        attributes: [{ value: { expression: '$nA$ * $nB$ / 100' } }],
      },
      { commandName: 'SwitchToSheet' },
      {
        commandName: 'SetCell',
        attributes: [
          {},
          { value: { expression: '$rosettaColumns[$nA$]$$nB.Number:toString$' } },
          {},
          {},
        ],
      },
    ]);
    const vars = r.json.variables as {
      name: string;
      type: string;
      defaultValue?: { list?: unknown[] };
    }[];
    expect(vars.find((v) => v.name === 'tsTook')?.type).toBe('NUMBER');
    expect(vars.find((v) => v.name === 'rosettaColumns')?.defaultValue?.list).toHaveLength(105);
  });

  it('writes no node for webAttach, with a note to pick the window in the web actions', () => {
    const r = generateA360(
      bot('b', [
        action('vendor:ibm-rpa/webAttach', {
          args: { browser: ref('vBrowser'), name: lit('main') },
        }),
      ]),
    );
    expect(r.json.nodes).toEqual([]);
    expect(r.notes.map((n) => n.kind)).toEqual(['semantic']);
    expect(r.notes[0]?.text).toMatch(/^webAttach: A360 has no "attach to browser"/);
  });

  it('never writes a credential value', () => {
    const r = generateA360(
      bot('b', [], {
        variables: [
          variable(
            'pwd',
            { kind: 'credential' },
            { sensitive: true, defaultValue: lit('S3cret!') },
          ),
        ],
      }),
    );
    expect(JSON.stringify(r.json)).not.toContain('S3cret!');
    expect(r.notes[0]?.text).toMatch(/locker/);
  });
});
