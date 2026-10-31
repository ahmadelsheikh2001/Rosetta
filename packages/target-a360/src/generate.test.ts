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
