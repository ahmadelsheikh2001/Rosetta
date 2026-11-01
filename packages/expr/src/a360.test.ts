import type { Expr } from '@rosetta/ir';
import { describe, expect, it } from 'vitest';
import { parseA360 } from './a360.js';

const v = (name: string): Expr => ({ kind: 'var', name, path: [] });
const lit = (value: string | number): Expr => ({ kind: 'literal', value });

// Every form below appears in corpus 01–04.
describe('parseA360', () => {
  it('parses a single variable', () => {
    expect(parseA360('$vStr$')).toEqual(v('vStr'));
  });

  it('parses text templates', () => {
    expect(parseA360('Prefix-$vText$-$vNumStr$-Suffix')).toEqual({
      kind: 'template',
      parts: [lit('Prefix-'), v('vText'), lit('-'), v('vNumStr'), lit('-Suffix')],
    });
  });

  it('parses list indexes as 0-based numbers', () => {
    expect(parseA360('$vList[0]$')).toEqual({
      kind: 'var',
      name: 'vList',
      path: [{ kind: 'index', index: lit(0) }],
    });
  });

  it('drops the quotes around record columns that contain spaces (corpus 09)', () => {
    expect(parseA360('$CsvTxtRow{"Company Name"}$')).toEqual({
      kind: 'var',
      name: 'CsvTxtRow',
      path: [{ kind: 'key', key: lit('Company Name') }],
    });
    expect(parseA360('$CsvTxtRow{State}$')).toEqual({
      kind: 'var',
      name: 'CsvTxtRow',
      path: [{ kind: 'key', key: lit('State') }],
    });
  });

  it('parses dictionary keys', () => {
    expect(parseA360('$vDict{name}$')).toEqual({
      kind: 'var',
      name: 'vDict',
      path: [{ kind: 'key', key: lit('name') }],
    });
  });

  it('parses a variable nested as dictionary key', () => {
    expect(parseA360('Key $vKey$ has value $vDict{$vKey$}$')).toEqual({
      kind: 'template',
      parts: [
        lit('Key '),
        v('vKey'),
        lit(' has value '),
        { kind: 'var', name: 'vDict', path: [{ kind: 'key', key: v('vKey') }] },
      ],
    });
  });

  it('maps known inline conversions to canonical functions', () => {
    expect(parseA360('$vNum.Number:toString$')).toEqual({
      kind: 'call',
      fn: 'convert.toString',
      args: [v('vNum')],
    });
    expect(parseA360('$vBool.Boolean:toString$')).toMatchObject({ fn: 'convert.toString' });
  });

  it('keeps unknown inline conversions recognisable', () => {
    expect(parseA360('$vX.Datetime:toString$')).toMatchObject({
      kind: 'call',
      fn: 'a360:Datetime:toString',
    });
    // with parentheses, as in a Bot Store export (A-25)
    expect(parseA360('$tbl.LegacyAutomation:tableToString()$')).toEqual({
      kind: 'call',
      fn: 'a360:LegacyAutomation:tableToString',
      args: [v('tbl')],
    });
  });

  it('parses system variables', () => {
    expect(parseA360('Machine=$System:Machine$')).toEqual({
      kind: 'template',
      parts: [lit('Machine='), { kind: 'system', name: 'a360:Machine' }],
    });
  });

  it('keeps URI prefixes as literal text', () => {
    expect(parseA360('file://$vFilePath$')).toEqual({
      kind: 'template',
      parts: [lit('file://'), v('vFilePath')],
    });
  });

  it('returns plain text without references as a literal', () => {
    expect(parseA360('cleanup done')).toEqual(lit('cleanup done'));
    expect(parseA360('')).toEqual(lit(''));
  });

  it('returns raw, never throws, for input it cannot read', () => {
    for (const bad of ['costs 5$', '$vList[0$', '$1abc$', '$$', '$v{a]$', '$vX.toString$']) {
      const result = parseA360(bad);
      expect(result.kind, bad).toBe('raw');
      if (result.kind === 'raw') {
        expect(result.text).toBe(bad);
        expect(result.reason).not.toBe('');
      }
    }
  });
});
