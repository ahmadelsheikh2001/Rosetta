import { describe, expect, it } from 'vitest';
import { readBotJson } from './read.js';

const opts = { file: 'bots/x.json', name: 'x' };
const bot = (nodes: unknown[], variables: unknown[] = []) => JSON.stringify({ nodes, variables });
const node = (packageName: string, commandName: string, extra: object = {}) => ({
  uid: `${packageName}-${commandName}`,
  commandName,
  packageName,
  disabled: false,
  ...extra,
});

describe('readBotJson', () => {
  it('reports invalid JSON instead of throwing', () => {
    const r = readBotJson('{ nope', opts);
    expect(r.bot).toBeUndefined();
    expect(r.diagnostics[0]).toMatchObject({ code: 'A360-JSON', severity: 'error' });
  });

  it('reports JSON without actions as not a task bot (forms, AI agents, processes)', () => {
    const r = readBotJson('{"hello": 1}', opts);
    expect(r.bot).toBeUndefined();
    expect(r.diagnostics[0]).toMatchObject({ code: 'A360-NOT-BOT', severity: 'warning' });
  });

  it('reports a bot file whose actions are not valid', () => {
    const r = readBotJson('{"nodes": 1}', opts);
    expect(r.bot).toBeUndefined();
    expect(r.diagnostics[0]).toMatchObject({ code: 'A360-SCHEMA', params: { path: 'nodes' } });
  });

  it('accepts a leading byte order mark', () => {
    expect(readBotJson(`${String.fromCharCode(0xfeff)}${bot([])}`, opts).bot).toBeDefined();
  });

  it('uses the registry lookup for mapping id and canonical op', () => {
    const r = readBotJson(bot([node('String', 'assign')]), {
      ...opts,
      lookup: (p, c) =>
        p === 'String' && c === 'assign'
          ? { id: 'a360.string.assign', irOp: 'variable.assign' }
          : undefined,
    });
    expect(r.bot?.body[0]).toMatchObject({
      kind: 'action',
      op: 'variable.assign',
      mappingId: 'a360.string.assign',
    });
  });

  it('keeps a command with unexpected children as unknown, still assessing its body', () => {
    const r = readBotJson(
      bot([node('Future', 'container', { children: [node('String', 'assign')] })]),
      opts,
    );
    expect(r.bot?.body[0]).toMatchObject({ kind: 'unknown', body: [{ kind: 'action' }] });
    expect(r.diagnostics[0]?.code).toBe('A360-STRUCTURE');
  });

  it('reports conditions with operators not seen in the corpus', () => {
    const cond = {
      name: 'condition',
      value: { type: 'CONDITIONAL', conditionalName: 'numberVariable', packageName: 'Number' },
      attributes: [
        { name: 'variable', value: { type: 'NUMBER', expression: '$n$' } },
        { name: 'operator', value: { type: 'STRING', string: 'BETWEEN' } },
        { name: 'value', value: { type: 'NUMBER', number: '1' } },
      ],
    };
    const r = readBotJson(bot([node('If', 'if', { attributes: [cond], children: [] })]), opts);
    expect(r.diagnostics[0]).toMatchObject({
      code: 'A360-CONDITION',
      params: { operator: 'BETWEEN' },
    });
    expect(r.bot?.body[0]).toMatchObject({
      kind: 'if',
      branches: [{ condition: { kind: 'raw' } }],
    });
  });

  it('flags string comparisons that ignore case as a semantic difference', () => {
    const cond = {
      name: 'condition',
      value: { type: 'CONDITIONAL', conditionalName: 'stringVariable', packageName: 'String' },
      attributes: [
        { name: 'variable', value: { type: 'STRING', expression: '$s$' } },
        { name: 'operator', value: { type: 'STRING', string: 'EQ' } },
        { name: 'value', value: { type: 'STRING', string: 'a' } },
        { name: 'matchCase', value: { type: 'BOOLEAN', boolean: false } },
      ],
    };
    const r = readBotJson(bot([node('If', 'if', { attributes: [cond], children: [] })]), opts);
    expect(r.diagnostics).toEqual([
      expect.objectContaining({ code: 'A360-SEMANTIC', category: 'semantic-difference' }),
    ]);
  });

  it('reports unknown variable and value types', () => {
    const r = readBotJson(
      bot(
        [node('X', 'y', { attributes: [{ name: 'w', value: { type: 'HOLOGRAM' } }] })],
        [{ name: 'win', type: 'HOLOGRAM' }],
      ),
      opts,
    );
    expect(r.diagnostics.map((d) => d.code).sort()).toEqual([
      'A360-UNKNOWN-VALUE',
      'A360-VARIABLE-TYPE',
    ]);
    expect(r.bot?.variables[0]?.type).toEqual({ kind: 'unknown', sourceType: 'HOLOGRAM' });
  });
});
